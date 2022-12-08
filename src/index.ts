// Modules
import { config as config_env } from "dotenv-safe";
config_env();

import fastify from "fastify";
import fastifyCors from "@fastify/cors";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

// Classes
import config from "./config.js";

import {
  addReplica,
  getBallotValueCounts,
  getReplica,
  startDB,
} from "./postgres.js";
import { Type } from "@sinclair/typebox";

// Variables

const server = fastify({
  trustProxy: true,
}).withTypeProvider<TypeBoxTypeProvider>();

const port: number = config.port;

await server.register(fastifyCors, {
  origin: [/localhost/, /yan3321\.com$/, /yan\.gg$/, /127.0.0.1/],
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
  const validBallots = replica
    .filter((item) => !treatAsUndiRosak(item.name))
    .map((item, index) => ({
      ...item,
      name: config.hidden ? (index + 1).toString() : item.name,
    }));
  const invalidBallots = replica.filter((item) => treatAsUndiRosak(item.name));

  let invalidCount = 0;

  invalidBallots.forEach((item) => {
    invalidCount += item.votes;
  });

  return {
    hidden: config.hidden,
    data: validBallots.concat({ name: "ROSAK", votes: invalidCount }),
  };
});

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
        await addReplica(
          req.body.id,
          req.body.value,
          req.body.timestamp_box,
          req.body.timestamp_ballot
        );
        return getReplica();
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
