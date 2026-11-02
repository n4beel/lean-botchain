import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { leanAbi } from "@/lib/botchain/abi";
import { convictionAt, averageSince, leader } from "@/lib/lean";

const PORT = 8630;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const localChain = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Alice
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Bob
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // Charlie
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // Dave
].map((k) => privateKeyToAccount(k as `0x${string}`));

describe("Lean On-Chain Integration Tests", { timeout: 60000 }, () => {
  let anvil: ChildProcess;
  let contractAddress: Address;

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC),
    pollingInterval: 100,
  });

  const wallets = ACCOUNTS.map((account) =>
    createWalletClient({ account, chain: localChain, transport: http(RPC) }),
  );
  const [alice, bob, charlie, dave] = wallets;

  async function mine() {
    await publicClient.request({ method: "evm_mine" as any, params: [] as any });
  }

  async function warp(seconds: number) {
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [seconds] as any,
    });
    await mine();
  }

  async function blockTime(): Promise<bigint> {
    return (await publicClient.getBlock()).timestamp;
  }

  async function waitTx(hash: `0x${string}`) {
    return publicClient.waitForTransactionReceipt({ hash, timeout: 15000 });
  }

  /** Creates a fresh poll; returns the poll id (bigint) */
  async function newPoll(
    creator: typeof alice,
    question: string,
    options: string[],
    durationSecs: bigint = 86400n,
  ): Promise<bigint> {
    const hash = await creator.writeContract({
      address: contractAddress,
      abi: leanAbi,
      functionName: "create",
      args: [question, options, durationSecs],
    });
    await waitTx(hash);
    const count = await publicClient.readContract({
      address: contractAddress,
      abi: leanAbi,
      functionName: "pollCount",
    });
    return count;
  }

  beforeAll(async () => {
    try { execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`); } catch {}

    anvil = spawn("anvil", [
      "--port", String(PORT),
      "--chain-id", String(CHAIN_ID),
      "--accounts", "10",
      "--balance", "10000",
      "--silent",
    ], { stdio: "ignore" });

    // Wait for anvil ready
    for (let i = 0; i < 80; i++) {
      try {
        await publicClient.getBlockNumber();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // Deploy
    const artPath = join(process.cwd(), "contracts", "out", "Lean.sol", "Lean.json");
    const art = JSON.parse(readFileSync(artPath, "utf8"));
    const deployHash = await alice.deployContract({
      abi: leanAbi,
      bytecode: art.bytecode.object as `0x${string}`,
      args: [],
    });
    const receipt = await waitTx(deployHash);
    if (!receipt.contractAddress) throw new Error("Deploy failed: no contractAddress");
    contractAddress = receipt.contractAddress;
  });

  afterAll(() => {
    if (anvil) anvil.kill();
    try { execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`); } catch {}
  });

  // ── Tests ──────────────────────────────────────────────────────────────

  it("creates a poll and validates initial state", async () => {
    const id = await newPoll(alice, "Should we deploy v2?", ["Yes", "No", "Defer"], 86400n);

    const poll = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "pollOf", args: [id],
    });
    expect(poll.asker.toLowerCase()).toBe(alice.account.address.toLowerCase());
    expect(poll.question).toBe("Should we deploy v2?");
    expect(poll.optionCount).toBe(3);

    const opts = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "optionsOf", args: [id],
    });
    expect(opts).toEqual(["Yes", "No", "Defer"]);
  });

  it("locks BOT and conviction client library matches on-chain", async () => {
    const id = await newPoll(alice, "Conviction vector test", ["Alpha", "Beta"], 86400n);

    // Bob locks 2 BOT on option 0
    const h1 = await bob.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "lean", args: [id, 0],
      value: parseEther("2"),
    });
    await waitTx(h1);

    await warp(3600);

    // Charlie locks 5 BOT on option 1
    const h2 = await charlie.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "lean", args: [id, 1],
      value: parseEther("5"),
    });
    await waitTx(h2);

    await warp(1800);

    const poll = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "pollOf", args: [id],
    });
    const now = await blockTime();

    // Check option 0 — client lib must equal on-chain
    const tot0 = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "totalsOf", args: [id, 0],
    });
    const onChain0 = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "convictionOf", args: [id, 0],
    });
    expect(convictionAt(tot0, now, poll.endsAt)).toBe(onChain0);

    // Check option 1
    const tot1 = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "totalsOf", args: [id, 1],
    });
    const onChain1 = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "convictionOf", args: [id, 1],
    });
    expect(convictionAt(tot1, now, poll.endsAt)).toBe(onChain1);

    // Client leader() must agree with contract leader()
    const [cBest, cTied] = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "leader", args: [id],
    });
    const clientL = leader([onChain0, onChain1]);
    expect(cBest).toBe(clientL.bestOption);
    expect(cTied).toBe(clientL.tied);
  });

  it("top-up on same option updates since with amount-weighted average", async () => {
    const id = await newPoll(alice, "Top-up test", ["X", "Y"], 86400n);

    const h1 = await bob.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "lean", args: [id, 0],
      value: parseEther("1"),
    });
    const r1 = await waitTx(h1);
    const block1 = await publicClient.getBlock({ blockHash: r1.blockHash });
    const since0 = block1.timestamp;

    await warp(1200);

    const h2 = await bob.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "lean", args: [id, 0],
      value: parseEther("3"),
    });
    const r2 = await waitTx(h2);
    const block2 = await publicClient.getBlock({ blockHash: r2.blockHash });
    const now2 = block2.timestamp;

    // Client-side expected since: (1*since0 + 3*now2) / 4
    const expectedSince = averageSince(parseEther("1"), since0, parseEther("3"), now2);

    const stakeAfter = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "stakeOf", args: [id, bob.account.address],
    });
    expect(stakeAfter.amount).toBe(parseEther("4"));
    expect(stakeAfter.since).toBe(expectedSince);
  });

  it("topping up on a different option reverts with WrongOption", async () => {
    const id = await newPoll(alice, "Wrong option test", ["P", "Q"], 86400n);

    const h1 = await bob.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "lean", args: [id, 0],
      value: parseEther("1"),
    });
    await waitTx(h1);

    // Bob tries to switch to option 1 — must revert
    await expect(
      bob.writeContract({
        address: contractAddress, abi: leanAbi,
        functionName: "lean", args: [id, 1],
        value: parseEther("1"),
      }),
    ).rejects.toThrow();
  });

  it("release while open removes weight from totals and credits pending", async () => {
    const id = await newPoll(alice, "Release test", ["A", "B"], 86400n);

    // Charlie stakes 5 BOT on option 1
    const h1 = await charlie.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "lean", args: [id, 1],
      value: parseEther("5"),
    });
    await waitTx(h1);

    const totBefore = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "totalsOf", args: [id, 1],
    });
    expect(totBefore.amountSum).toBe(parseEther("5"));

    // Charlie releases
    const h2 = await charlie.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "release", args: [id],
    });
    await waitTx(h2);

    // Totals should be zero
    const totAfter = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "totalsOf", args: [id, 1],
    });
    expect(totAfter.amountSum).toBe(0n);
    expect(totAfter.weightedSince).toBe(0n);

    // Pending credited
    const pend = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "pending", args: [charlie.account.address],
    });
    expect(pend).toBeGreaterThanOrEqual(parseEther("5"));

    // Charlie withdraws and balance increases by ~5 BOT
    const bal0 = await publicClient.getBalance({ address: charlie.account.address });
    const h3 = await charlie.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "withdraw",
    });
    const r3 = await waitTx(h3);
    const bal1 = await publicClient.getBalance({ address: charlie.account.address });

    const gas = r3.gasUsed * r3.effectiveGasPrice;
    // received ≈ 5 BOT net of gas
    expect(bal1 + gas - bal0).toBe(parseEther("5"));
  });

  it("tallies freeze at endsAt, late release does not change frozen conviction", async () => {
    // Use a very short poll (3600 = MIN_DURATION)
    const id = await newPoll(alice, "Freeze test", ["M", "N"], 3600n);

    const h1 = await bob.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "lean", args: [id, 0],
      value: parseEther("3"),
    });
    await waitTx(h1);

    // Advance past endsAt
    await warp(3700);

    // Lean should revert after end
    await expect(
      dave.writeContract({
        address: contractAddress, abi: leanAbi,
        functionName: "lean", args: [id, 1],
        value: parseEther("1"),
      }),
    ).rejects.toThrow();

    // Record conviction at end
    const convAtEnd = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "convictionOf", args: [id, 0],
    });
    expect(convAtEnd).toBeGreaterThan(0n);

    const totBefore = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "totalsOf", args: [id, 0],
    });

    // Bob releases after end — totals must stay frozen
    const h2 = await bob.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "release", args: [id],
    });
    await waitTx(h2);

    const totAfter = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "totalsOf", args: [id, 0],
    });
    expect(totAfter.amountSum).toBe(totBefore.amountSum);
    expect(totAfter.weightedSince).toBe(totBefore.weightedSince);

    // Conviction stays the same (frozen at endsAt)
    const convAfter = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "convictionOf", args: [id, 0],
    });
    expect(convAfter).toBe(convAtEnd);

    // Bob's pending is credited the staked amount
    const pend = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "pending", args: [bob.account.address],
    });
    expect(pend).toBeGreaterThanOrEqual(parseEther("3"));
  });

  it("equal-time-equal-amount stakes result in a tie", async () => {
    const id = await newPoll(alice, "Tie test", ["Left", "Right"], 3600n);

    // Mine both stakes in the same block (disable automine)
    await publicClient.request({ method: "evm_setAutomine" as any, params: [false] as any });

    await bob.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "lean", args: [id, 0],
      value: parseEther("2"),
    });
    await charlie.writeContract({
      address: contractAddress, abi: leanAbi,
      functionName: "lean", args: [id, 1],
      value: parseEther("2"),
    });

    await mine();
    await publicClient.request({ method: "evm_setAutomine" as any, params: [true] as any });

    await warp(100); // let some conviction accumulate equally

    const [, isTied] = await publicClient.readContract({
      address: contractAddress, abi: leanAbi,
      functionName: "leader", args: [id],
    });
    expect(isTied).toBe(true);
  });
});
