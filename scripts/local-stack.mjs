/**
 * Local stack runner and seeder for Lean (Archetype AI · Tilt).
 *
 * Spawns anvil on port 8730 with chain id 968, deploys Lean, and seeds 5 polls per spec §5:
 * - Poll 1: Open with 3 stakes across 2 options held for different times
 * - Poll 2: Ending in ~10 minutes
 * - Poll 3: Ended with a clear leader and released/unreleased stakes
 * - Poll 4: Tied
 * - Poll 5: New (no stakes yet)
 *
 * Role table: asker (Alice), holders A–D (Bob, Charlie, Dave, Eve).
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8730;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Alice (Asker)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Bob (Holder A)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Charlie (Holder B)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Dave (Holder C)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4: Eve (Holder D)
];

const accounts = KEYS.map((k) => privateKeyToAccount(k));

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

console.log(`Starting anvil on port ${PORT}...`);
const anvil = spawn(
  "anvil",
  [
    "--port", String(PORT),
    "--chain-id", String(CHAIN_ID),
    "--accounts", "10",
    "--balance", "10000",
    "--silent",
  ],
  { stdio: "ignore" }
);

const publicClient = createPublicClient({
  chain: local,
  transport: http(RPC),
});

const [alice, bob, charlie, dave, eve] = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http(RPC) })
);

async function waitTx(hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

async function warp(seconds) {
  await publicClient.request({
    method: "evm_increaseTime",
    params: [seconds],
  });
  await publicClient.request({ method: "evm_mine", params: [] });
}

async function main() {
  console.log("Waiting for RPC...");
  for (let i = 0; i < 50; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log("Compiling contracts...");
  execSync("forge build", { cwd: join(process.cwd(), "contracts") });

  const artifactPath = join(
    process.cwd(),
    "contracts",
    "out",
    "Lean.sol",
    "Lean.json"
  );
  const { abi, bytecode } = JSON.parse(readFileSync(artifactPath, "utf-8"));

  console.log("Deploying Lean...");
  const deployHash = await alice.deployContract({
    abi,
    bytecode: bytecode.object,
    args: [],
  });
  const receipt = await waitTx(deployHash);
  const contractAddress = receipt.contractAddress;
  console.log(`Lean deployed at: ${contractAddress}`);

  // Write .env.local for local development
  const envContent = [
    `NEXT_PUBLIC_BOTCHAIN_CHAIN_ID=968`,
    `NEXT_PUBLIC_RPC_URL_968=http://127.0.0.1:${PORT}`,
    `NEXT_PUBLIC_CONTRACT_968=${contractAddress}`,
    `NEXT_PUBLIC_DEPLOY_BLOCK_968=1`,
  ].join("\n");
  writeFileSync(join(process.cwd(), ".env.local"), envContent);
  console.log("Updated .env.local with deployed contract address");

  // Helper to create poll
  async function createPoll(asker, q, opts, dur) {
    const hash = await asker.writeContract({
      address: contractAddress,
      abi,
      functionName: "create",
      args: [q, opts, dur],
    });
    await waitTx(hash);
  }

  // Helper to lean
  async function lean(holder, pollId, opt, ethAmount) {
    const hash = await holder.writeContract({
      address: contractAddress,
      abi,
      functionName: "lean",
      args: [pollId, opt],
      value: parseEther(ethAmount),
    });
    await waitTx(hash);
  }

  // Helper to release
  async function release(holder, pollId) {
    const hash = await holder.writeContract({
      address: contractAddress,
      abi,
      functionName: "release",
      args: [pollId],
    });
    await waitTx(hash);
  }

  console.log("Seeding polls...");

  // Poll 1: Open with 3 stakes across 2 options held for different times
  // Question: Should BOT Chain protocol v2 adopt optimistic rollups or ZK validity proofs?
  // Duration: 7 days (604800s)
  await createPoll(
    alice,
    "Should BOT Chain protocol v2 adopt optimistic rollups or ZK validity proofs?",
    ["Optimistic Rollups", "ZK Validity Proofs"],
    604800n
  );
  console.log("  Poll 1 created (Open)");

  // Bob leans 10 BOT on option 1 (ZK)
  await lean(bob, 1n, 1, "10");
  await warp(7200); // 2 hours later

  // Charlie leans 15 BOT on option 0 (Optimistic)
  await lean(charlie, 1n, 0, "15");
  await warp(3600); // 1 hour later

  // Dave leans 5 BOT on option 1 (ZK)
  await lean(dave, 1n, 1, "5");
  console.log("  Poll 1 seeded with 3 stakes across 2 options");

  // Poll 2: Ending in ~10 minutes (600s)
  // Question: Migrate core staking pool epoch length to 24 hours?
  // Duration: 3600s total, we warp 3000s so 600s remain (~10 min)
  await createPoll(
    alice,
    "Migrate core staking pool epoch length to 24 hours?",
    ["Yes (24h)", "No (Keep 12h)"],
    3600n
  );
  await lean(bob, 2n, 0, "8");
  await lean(charlie, 2n, 1, "4");
  await warp(3000); // 10 minutes remaining
  console.log("  Poll 2 created (Ending in ~10 min)");

  // Poll 3: Ended with a clear leader and released/unreleased stakes
  // Question: Treasury grant for ecosystem indexer infrastructure?
  // Duration: 3600s total, we warp past 3600s
  await createPoll(
    alice,
    "Treasury grant for ecosystem indexer infrastructure?",
    ["Approve Grant", "Reject", "Request Revision"],
    3600n
  );
  await lean(bob, 3n, 0, "20"); // Option 0 wins
  await lean(charlie, 3n, 1, "5");
  await lean(dave, 3n, 2, "3");
  await warp(4000); // Poll ended

  // Dave releases his stake post-end (totals stay frozen!)
  await release(dave, 3n);
  console.log("  Poll 3 created (Ended with leader & released stake)");

  // Poll 4: Tied
  // Question: Equal conviction test: Option Alpha or Option Beta?
  // Duration: 7200s, both options receive exact same amount at exact same block
  await createPoll(
    alice,
    "Equal conviction test: Option Alpha or Option Beta?",
    ["Option Alpha", "Option Beta"],
    7200n
  );
  await lean(bob, 4n, 0, "10");
  await lean(charlie, 4n, 1, "10");
  console.log("  Poll 4 created (Tied)");

  // Poll 5: New (no stakes)
  // Question: Add gas rebate for automated liquidation keepers?
  await createPoll(
    alice,
    "Add gas rebate for automated liquidation keepers?",
    ["Support (50% rebate)", "Oppose", "Abstain"],
    86400n
  );
  console.log("  Poll 5 created (New, no stakes)");

  console.log("\n========================================================");
  console.log("Lean local stack running on port", PORT);
  console.log("Contract Address:", contractAddress);
  console.log("Role Table:");
  console.log("  Alice (Asker):    ", alice.account.address);
  console.log("  Bob (Holder A):   ", bob.account.address);
  console.log("  Charlie (Holder B):", charlie.account.address);
  console.log("  Dave (Holder C):  ", dave.account.address);
  console.log("  Eve (Holder D):   ", eve.account.address);
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error("Local stack error:", err);
  if (anvil) anvil.kill();
  process.exit(1);
});
