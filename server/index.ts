import { createApp } from "./app";

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

app.listen(port, () => {
  console.log(`Hive Mind API listening on http://localhost:${port}`);
});
