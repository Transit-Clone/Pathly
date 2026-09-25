import cors from "cors";
import express from "express";

export const app = express();

app.disable("x-powered-by");
app.use(
  cors({
    origin: "*",
    methods: ["GET"],
  }),
);

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "pathly-api",
  });
});
