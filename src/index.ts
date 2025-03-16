// Modules
import { config as config_env } from "dotenv-safe";
config_env();

import fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import { Type, TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

// Classes
import config from "./config.js";

import {
  addReplica,
  addSeat,
  getAllVotesByParty,
  getAllVotesBySeries,
  getBallotValueCounts,
  getBallotValueCountsBySeries,
  getSeats,
  getSeriesIdentifiers,
  getTimestamps,
  InvoteBallotCountData,
  startDB,
} from "./postgres.js";

// Variables

const server = fastify({
  trustProxy: true,
}).withTypeProvider<TypeBoxTypeProvider>();

const port: number = config.port;
const hour = 1000 * 60 * 60;
const hoursBeforeReveal = 3 * hour;

const origins = [
  /localhost/,
  /127.0.0.1/,
  /yan3321\.com$/,
  /yan\.gg$/,
  /mysver\.se$/,
  /mys\.gg$/,
];

await server.register(fastifyCors, {
  origin: origins,
});

await server.register(fastifyWebsocket);

export function broadcastWS(series: string, data: any) {
  for (let client of server.websocketServer.clients) {
    client.send(
      JSON.stringify({
        s: series,
        t: new Date(),
        d: data,
      })
    );
  }
}

server.register(async function (server) {
  server.get("/ws", { websocket: true }, (connection) => {
    connection.on("error", console.error);
  });
});

function treatAsUndiRosak(string: string | null | undefined) {
  if (string === null || typeof string === "undefined") {
    return true;
  } else if (string === "" || string === "ROSAK") {
    return true;
  }
  return false;
}

server.get("/stats", async () => {
  const replica = await getBallotValueCounts();
  return processResults(replica);
});

function getOrdinal(n: number) {
  let ord = "th";

  if (n % 10 == 1 && n % 100 != 11) {
    ord = "st";
  } else if (n % 10 == 2 && n % 100 != 12) {
    ord = "nd";
  } else if (n % 10 == 3 && n % 100 != 13) {
    ord = "rd";
  }

  return ord;
}

async function processResults(
  replica: InvoteBallotCountData[],
  hidden: boolean = false
) {
  // const validBallots = replica
  //   .filter((item) => !treatAsUndiRosak(item.name))
  //   .map((item, index) => ({
  //     ...item,
  //     name: hidden ? `${index + 1}${getOrdinal(index + 1)}` : item.name,
  //   }));

  // const invalidBallots = replica.filter((item) => treatAsUndiRosak(item.name));

  // let invalidCount = 0;

  // invalidBallots.forEach((item) => {
  //   invalidCount += item.votes;
  // });

  // return {
  //   hidden: hidden,
  //   data: validBallots.concat({ name: "ROSAK", votes: invalidCount }),
  // };

  const data = replica.map((item, index) => ({
    ...item,
    name: hidden
      ? `${index + 1}${getOrdinal(index + 1)}`
      : treatAsUndiRosak(item.name)
      ? "ROSAK"
      : item.name,
  }));

  // if not hidden, sort invalid votes last
  if (!hidden) {
    data.sort((a, b) => {
      if (a.name === "ROSAK" && b.name !== "ROSAK") return 1;
      if (a.name !== "ROSAK" && b.name === "ROSAK") return -1;
      return 0;
    });
    // data is now reordered as needed
  }

  return {
    hidden,
    data,
  };
}

server.get("/stats/series-identifiers", async () => {
  const seriesIdentifiers = await getSeriesIdentifiers();
  return seriesIdentifiers.map((item) => item.series_identifier);
});

server.get("/stats/votes/party", getAllVotesByParty);

server.get("/stats/votes/series", getAllVotesBySeries);

server.get(
  "/stats/timestamp",
  {
    schema: {
      querystring: Type.Object({
        series_identifier: Type.Optional(Type.String()),
      }),
    },
  },
  async (req, res) => {
    const seriesIdentifier = req.query.series_identifier;
    const hidden =
      config.hidden &&
      (seriesIdentifier === config.seriesIdentifier || !seriesIdentifier);
    const timestamps = await getTimestamps(seriesIdentifier);
    const results = [];
    for (const timestamp of timestamps) {
      const value = timestamp.timestamp_box;
      if (value) {
        if (hidden) {
          if (Date.now() < value.getTime() + hoursBeforeReveal) {
            continue;
          }
        }
        results.push({
          timestamp: value,
          results: await processResults(
            await getBallotValueCounts(value),
            hidden
          ),
        });
      }
    }
    return results;
  }
);

server.get(
  "/stats/total/:series_identifier",
  { schema: { params: Type.Object({ series_identifier: Type.String() }) } },
  async (req, res) => {
    const seriesIdentifier = req.params.series_identifier;
    const hidden =
      config.hidden && seriesIdentifier === config.seriesIdentifier;
    return processResults(
      await getBallotValueCountsBySeries(seriesIdentifier),
      hidden
    );
  }
);

server.get(
  "/stats/seats/:series_identifier",
  { schema: { params: Type.Object({ series_identifier: Type.String() }) } },
  async (req, res) => {
    const seriesIdentifier = req.params.series_identifier;
    const seats = await getSeats(seriesIdentifier);
    return seats;
  }
);

server.post(
  "/add-ballot",
  {
    schema: {
      body: Type.Strict(
        Type.Object({
          id: Type.Optional(Type.String()),
          value: Type.Optional(Type.String()),
          timestamp_box: Type.Number(),
          timestamp_ballot: Type.Number(),
        })
      ),
    },
  },
  async (req, res) => {
    try {
      const authed =
        req.headers.authorization === `Api-Key ${config.credentials.api}`;
      if (authed) {
        if (req.body.id === "TEST") {
          res.status(500);
          return { error: "Test ballot not allowed!" };
        }
        await addReplica(
          req.body.id,
          req.body.value,
          req.body.timestamp_box,
          req.body.timestamp_ballot
        );
        return { success: true };
      } else {
        res.status(401);
        return { error: "Not authorised!" };
      }
    } catch (error) {
      res.status(500);
      console.error(error);
      return {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      } as any;
    }
  }
);

server.post(
  "/add-seat",
  {
    schema: {
      body: Type.Strict(
        Type.Object({
          index: Type.Number(),
          value: Type.Optional(Type.String()),
        })
      ),
    },
  },
  async (req, res) => {
    try {
      const authed =
        req.headers.authorization === `Api-Key ${config.credentials.api}`;
      if (authed) {
        await addSeat(req.body.index, req.body.value);
        return { success: true };
      } else {
        res.status(401);
        return { error: "Not authorised!" };
      }
    } catch (error) {
      res.status(500);
      return {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      } as any;
    }
  }
);

async function bootstrap() {
  await Promise.all([startDB()]);
  const address = await server.listen({ port: port });
  await server.ready();
  console.log(`Server listening at ${address}`);
}

await bootstrap();
