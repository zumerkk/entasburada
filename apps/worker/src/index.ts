import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { parseProductXmlPreview } from "@entas/import-engine";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null
});

export const queues = {
  import: new Queue("import-jobs", { connection }),
  notifications: new Queue("notifications", { connection }),
  analytics: new Queue("analytics", { connection }),
  abandonedCarts: new Queue("abandoned-carts", { connection })
};

new Worker(
  "import-jobs",
  async (job) => {
    if (job.name === "preview-product-xml") {
      const xml = job.data.xml as string;
      return parseProductXmlPreview(toChunks(xml), { previewLimit: 100 });
    }

    return {
      skipped: true,
      reason: `Tanımsız import job: ${job.name}`
    };
  },
  { connection }
);

new Worker(
  "notifications",
  async (job) => ({
    queued: true,
    channel: job.data.channel,
    trigger: job.data.trigger
  }),
  { connection }
);

new Worker(
  "abandoned-carts",
  async (job) => ({
    reminderRule: job.name,
    companyId: job.data.companyId,
    nextAction: "sales_rep_task_or_message"
  }),
  { connection }
);

async function* toChunks(value: string): AsyncIterable<string> {
  yield value;
}

process.on("SIGINT", async () => {
  await Promise.all(Object.values(queues).map((queue) => queue.close()));
  await connection.quit();
  process.exit(0);
});
