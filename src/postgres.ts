import pkg from "pg";
const { Pool, types } = pkg;

import config from "./config.js";

const pool = new Pool({ connectionString: config.connectionString });

import { broadcastWS } from "./index.js";

export async function startDB() {
  try {
    console.log("Attempting to connect...");
    // TODO: this is likely UNSAFE, try to change in the future: https://stackoverflow.com/a/39176670/3954754
    types.setTypeParser(20, parseInt);
    await pool.connect();
    console.log("Connected");
  } catch (error) {
    console.error(error);
    throw new Error("Unable to connect to Postgres database!");
  }
}

const table_ballots = "invote_ballots";
const table_seats = "invote_seats";

interface InvoteBallotData {
  id?: string | null;
  value?: string | null;
  timestamp_box?: Date | null;
  timestamp_ballot?: Date | null;
  series_identifier?: string | null;
}

interface InvoteBoxTimestamp {
  timestamp_box?: Date | null;
}

export async function getReplica() {
  const response = await pool.query<InvoteBallotData>(
    `SELECT * FROM ${table_ballots}`
  );
  return response.rows;
}

export interface InvoteBallotCountData {
  name?: string | null;
  votes: number;
}

interface InvoteSeriesIdentifier {
  series_identifier: string | null;
}

export async function getSeriesIdentifiers() {
  const response = await pool.query<InvoteSeriesIdentifier>(
    `SELECT DISTINCT series_identifier FROM ${table_ballots} ORDER BY series_identifier DESC`
  );
  return response.rows;
}

export async function getBallotValueCounts(timestamp_box?: Date) {
  let query = `SELECT value AS name, COUNT(*) AS votes FROM ${table_ballots} GROUP BY name ORDER BY votes DESC;`;
  if (timestamp_box) {
    query = `SELECT value AS name, COUNT(*) AS votes FROM ${table_ballots} WHERE timestamp_box = $1 GROUP BY name ORDER BY votes DESC;`;
  }
  const response = await pool.query<InvoteBallotCountData>(
    query,
    timestamp_box ? [timestamp_box] : []
  );
  return response.rows;
}

export async function getTimestamps(seriesIdentifier?: string) {
  let query = `SELECT DISTINCT timestamp_box FROM ${table_ballots} ORDER BY timestamp_box DESC;`;
  if (seriesIdentifier) {
    query = `SELECT DISTINCT timestamp_box FROM ${table_ballots} WHERE series_identifier = $1 ORDER BY timestamp_box DESC;`;
  }
  const response = await pool.query<InvoteBoxTimestamp>(
    query,
    seriesIdentifier ? [seriesIdentifier] : []
  );
  return response.rows;
}

interface InvoteSeats {
  index: number;
  party: string | null;
}

export async function getSeats(seriesIdentifier: string) {
  const response = await pool.query<InvoteSeats>(
    `SELECT DISTINCT index, party FROM ${table_seats} WHERE series_identifier = $1 ORDER BY index ASC;`,
    [seriesIdentifier]
  );
  return response.rows;
}

export async function getSeat(seriesIdentifier: string, index: number) {
  const response = await pool.query<InvoteSeats>(
    `SELECT DISTINCT index, party FROM ${table_seats} WHERE series_identifier = $1 AND index = $2 LIMIT 1;`,
    [seriesIdentifier, index]
  );
  const result: InvoteSeats | undefined = response.rows[0];
  if (result) {
    return result;
  } else {
    return undefined;
  }
}

interface PartyVoteData {
  party: string | null;
  votes: number;
}

export async function getAllVotesByParty() {
  const response = await pool.query<PartyVoteData>(
    `SELECT value AS party,
        COUNT(*) AS votes
    FROM
        invote_ballots
    GROUP BY
        party
    ORDER BY
        votes DESC;
    `
  );
  return response.rows;
}

interface SeriesVoteData {
  series_identifier: string;
  total: number;
  invalid: number;
}

export async function getAllVotesBySeries() {
  const response = await pool.query<SeriesVoteData>(
    `SELECT series_identifier,
        COUNT(*) AS total,
        COUNT(
            CASE
                WHEN value IS NULL THEN 1
                ELSE NULL
            END
        ) AS invalid
    FROM
        invote_ballots
    GROUP BY
        series_identifier;
    `
  );
  return response.rows;
}

export async function addSeat(index: number, party?: string | null) {
  if (!config.seriesIdentifier) {
    throw new Error("Series identifier not set in config!");
  }
  const previousSeat = await getSeat(config.seriesIdentifier, index);

  await pool.query<any>(
    `
    INSERT INTO
        ${table_seats} (index, party, series_identifier)
    VALUES($1, $2, $3) ON CONFLICT (index, series_identifier) DO
    UPDATE
    SET
        party = EXCLUDED.party;
    `,
    [index, party, config.seriesIdentifier]
  );
  if (!previousSeat || previousSeat.party !== party) {
    broadcastWS(config.seriesIdentifier, {
      type: "seat",
      index,
      party,
    });
  }
}

export async function addReplica(
  id: string | undefined,
  value: string | undefined,
  timestamp_box: number,
  timestamp_ballot: number
) {
  await pool.query<any>(
    `INSERT INTO ${table_ballots} (id, value, timestamp_box, timestamp_ballot, series_identifier) VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      value,
      new Date(timestamp_box),
      new Date(timestamp_ballot),
      config.seriesIdentifier,
    ]
  );
}
