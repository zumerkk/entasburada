import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
vi.mock("server-only", () => ({}));
import { withCommercialFileLock } from "./commercial-file-lock";
let dir = "";
afterEach(async () => { if(dir) await rm(dir, {recursive:true,force:true}); });
describe("commercial file lock", () => {
  it("serializes independent callers and releases after failure", async () => {
    dir=await mkdtemp(path.join(tmpdir(),"entas-lock-test-"));
    const counter=path.join(dir,"counter"); await writeFile(counter,"0");
    const increment=() => withCommercialFileLock(dir,async () => {
      const previous=Number(await readFile(counter,"utf8"));
      await new Promise(resolve => setTimeout(resolve,20));
      await writeFile(counter,String(previous+1));
    });
    await Promise.all([increment(),increment(),increment()]);
    expect(await readFile(counter,"utf8")).toBe("3");
    await expect(withCommercialFileLock(dir,async () => {throw new Error("test failure");})).rejects.toThrow("test failure");
    await increment(); expect(await readFile(counter,"utf8")).toBe("4");
  });
});
