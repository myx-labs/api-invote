import pkg from "pg";
const { Pool, types } = pkg;

const pool = new Pool();

import config from "./config.js";

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

const table = "invote_ballots";

interface InvoteBallotData {
  id?: string | null;
  value?: string | null;
  timestamp_box?: number | null;
  timestamp_ballot?: number | null;
  series_identifier?: string | null;
}

export async function getReplica() {
  const response = await pool.query<InvoteBallotData>(`SELECT * FROM ${table}`);
  return response.rows;
}

interface InvoteBallotCountData {
  name?: string | null;
  votes: number;
}

export async function getBallotValueCounts() {
  const response = await pool.query<InvoteBallotCountData>(
    `SELECT value AS name, COUNT(*) AS votes FROM ${table} GROUP BY name ORDER BY votes DESC;`
  );
  return response.rows;
}

export async function addReplica(
  id: string,
  value: string,
  timestamp_box: number,
  timestamp_ballot: number
) {
  await pool.query(
    `INSERT INTO ${table} (id, value, timestamp_box, timestamp_ballot, series_identifier) VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      value,
      new Date(timestamp_box),
      new Date(timestamp_ballot),
      config.seriesIdentifier,
    ]
  );
}
