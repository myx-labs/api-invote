import { config as config_env } from "dotenv-safe";
config_env();

export default {
  testMode: false,
  hidden: process.env.REVEAL_PARTIES === "true" ? false : true,
  seriesIdentifier: process.env.IDENTIFIER,
  port:
    typeof process.env.API_PORT !== "undefined"
      ? parseInt(process.env.API_PORT)
      : 3000,
  credentials: {
    api: process.env.AUTHENTICATION_KEY as string,
  },
  connectionString: process.env.DATABASE_URL,
};
