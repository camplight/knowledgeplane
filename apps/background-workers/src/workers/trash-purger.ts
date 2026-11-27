import { Fact } from "@knowledgeplane/db";

export class TrashPurger {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start() {
    const run = async () => {
      if (this.running) {
        return;
      }
      this.running = true;
      try {
        const removed = await Fact.purgeExpired(new Date().toISOString());
        if (removed > 0) {
          console.log(`Purged ${removed} expired trashed facts`);
        }
      } catch (error: any) {
        console.error("Trash purge failed:", error.message);
      } finally {
        this.running = false;
      }
    };

    void run();
    this.timer = setInterval(run, 60 * 60 * 1000);
    console.log("Trash purger started");
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
