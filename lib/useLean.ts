"use client";

import { useState, useCallback, useMemo } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { type Address, parseEther, parseEventLogs } from "viem";
import { leanAbi } from "./botchain/abi";
import { getDeployment, ZERO_ADDRESS } from "./botchain/deployment";
import { activeBotChain } from "./botchain/chain";
import { assertActiveChain, waitSuccess } from "./useChainWrite";
import { decodeContractError } from "./errors";
import type { OptionTotals, UserStake, PollData } from "./lean";

export function useLean() {
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id }); // stable-hook-result
  const { data: walletClient } = useWalletClient();

  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const contractAddress = useMemo<Address>(() => {
    const envAddr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address | undefined;
    if (envAddr && envAddr !== ZERO_ADDRESS) return envAddr;
    const deployment = getDeployment(activeBotChain.id);
    return deployment?.address ?? ZERO_ADDRESS;
  }, []);

  const isContractDeployed = Boolean(contractAddress && contractAddress !== ZERO_ADDRESS);

  /**
   * Fetches the total number of polls created so far.
   */
  const getPollCount = useCallback(async (): Promise<bigint> => {
    if (!publicClient || !isContractDeployed) return 0n;
    try {
      const count = await publicClient.readContract({
        address: contractAddress,
        abi: leanAbi,
        functionName: "pollCount",
      });
      return count as bigint;
    } catch {
      return 0n;
    }
  }, [publicClient, isContractDeployed, contractAddress]);

  /**
   * Fetches full poll data including options, totals, convictions, leader, and user stake.
   */
  const getPoll = useCallback(
    async (id: bigint): Promise<PollData | null> => {
      if (!publicClient || !isContractDeployed || id <= 0n) return null;
      try {
        const poll = (await publicClient.readContract({
          address: contractAddress,
          abi: leanAbi,
          functionName: "pollOf",
          args: [id],
        })) as { asker: Address; endsAt: bigint; optionCount: number; question: string };

        const options = (await publicClient.readContract({
          address: contractAddress,
          abi: leanAbi,
          functionName: "optionsOf",
          args: [id],
        })) as string[];

        // Fetch totals for each option
        const totalsPromises: Promise<OptionTotals>[] = [];
        for (let i = 0; i < poll.optionCount; i++) {
          totalsPromises.push(
            publicClient.readContract({
              address: contractAddress,
              abi: leanAbi,
              functionName: "totalsOf",
              args: [id, i],
            }) as Promise<OptionTotals>
          );
        }
        const totals = await Promise.all(totalsPromises);

        // Fetch convictions
        const convictions = (await publicClient.readContract({
          address: contractAddress,
          abi: leanAbi,
          functionName: "convictions",
          args: [id],
        })) as bigint[];

        // Fetch leader
        const [bestOption, tied] = (await publicClient.readContract({
          address: contractAddress,
          abi: leanAbi,
          functionName: "leader",
          args: [id],
        })) as [number, boolean];

        return {
          id,
          asker: poll.asker,
          endsAt: poll.endsAt,
          optionCount: poll.optionCount,
          question: poll.question,
          options,
          totals,
          convictions,
          leader: {
            bestOption,
            tied,
          },
        };
      } catch {
        return null;
      }
    },
    [publicClient, isContractDeployed, contractAddress]
  );

  /**
   * Fetches a user's stake on a specific poll.
   */
  const getStake = useCallback(
    async (pollId: bigint, who?: Address): Promise<UserStake | null> => {
      const target = who ?? userAddress;
      if (!publicClient || !isContractDeployed || !target || pollId <= 0n) return null;
      try {
        const stake = (await publicClient.readContract({
          address: contractAddress,
          abi: leanAbi,
          functionName: "stakeOf",
          args: [pollId, target],
        })) as { amount: bigint; since: bigint; option: number };

        if (stake.amount === 0n) return null;
        return stake;
      } catch {
        return null;
      }
    },
    [publicClient, isContractDeployed, contractAddress, userAddress]
  );

  /**
   * Fetches latest polls (offset, count).
   */
  const getLatestPolls = useCallback(
    async (offset: bigint, count: bigint): Promise<PollData[]> => {
      if (!publicClient || !isContractDeployed) return [];
      try {
        const totalCount = await getPollCount();
        if (totalCount === 0n || offset >= totalCount) return [];

        const limit = count > 50n ? 50n : count;
        const actualCount = offset + limit > totalCount ? totalCount - offset : limit;

        const results: PollData[] = [];
        for (let i = 0n; i < actualCount; i++) {
          const pollId = totalCount - offset - i;
          const pollData = await getPoll(pollId);
          if (pollData) results.push(pollData);
        }
        return results;
      } catch {
        return [];
      }
    },
    [publicClient, isContractDeployed, getPollCount, getPoll]
  );

  /**
   * Fetches pending withdrawal balance for user.
   */
  const getPending = useCallback(
    async (who?: Address): Promise<bigint> => {
      const target = who ?? userAddress;
      if (!publicClient || !isContractDeployed || !target) return 0n;
      try {
        const amount = await publicClient.readContract({
          address: contractAddress,
          abi: leanAbi,
          functionName: "pending",
          args: [target],
        });
        return amount as bigint;
      } catch {
        return 0n;
      }
    },
    [publicClient, isContractDeployed, contractAddress, userAddress]
  );

  /**
   * Calculates holder counts per option for a poll from event logs.
   */
  const getHoldersCount = useCallback(
    async (pollId: bigint): Promise<Record<number, number>> => {
      if (!publicClient || !isContractDeployed) return {};
      try {
        const deployment = getDeployment(activeBotChain.id);
        const fromBlock = deployment?.deployBlock ? BigInt(deployment.deployBlock) : 0n;

        const logs = await publicClient.getLogs({
          address: contractAddress,
          fromBlock,
          toBlock: "latest",
        });

        const activeStakers: Record<number, Set<string>> = {};

        for (const log of logs) {
          try {
            const parsed = parseEventLogs({
              abi: leanAbi,
              logs: [log],
            });
            for (const event of parsed) {
              if (event.eventName === "Leaned") {
                const args = event.args as {
                  id: bigint;
                  who: Address;
                  option: number;
                  amount: bigint;
                };
                if (args.id === pollId) {
                  if (!activeStakers[args.option]) activeStakers[args.option] = new Set();
                  activeStakers[args.option].add(args.who.toLowerCase());
                }
              } else if (event.eventName === "Released") {
                const args = event.args as { id: bigint; who: Address };
                if (args.id === pollId) {
                  for (const opt in activeStakers) {
                    activeStakers[opt].delete(args.who.toLowerCase());
                  }
                }
              }
            }
          } catch {
            // Ignore non-matching logs
          }
        }

        const counts: Record<number, number> = {};
        for (const opt in activeStakers) {
          counts[Number(opt)] = activeStakers[opt].size;
        }
        return counts;
      } catch {
        return {};
      }
    },
    [publicClient, isContractDeployed, contractAddress]
  );

  /**
   * Transaction: Create a new poll.
   */
  const createPoll = useCallback(
    async (
      question: string,
      options: string[],
      durationSecs: bigint
    ): Promise<bigint | null> => {
      if (!walletClient || !publicClient || !isContractDeployed) {
        throw new Error("Wallet not connected or contract not deployed.");
      }
      setIsBusy(true);
      setError(null);
      try {
        assertActiveChain(walletClient);
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: leanAbi,
          functionName: "create",
          args: [question, options, durationSecs],
        });
        const receipt = await waitSuccess(publicClient, hash);
        const parsed = parseEventLogs({
          abi: leanAbi,
          logs: receipt.logs,
          eventName: "Created",
        });
        if (parsed.length > 0) {
          return (parsed[0].args as { id: bigint }).id;
        }
        return await getPollCount();
      } catch (err) {
        const msg = decodeContractError(err, options);
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsBusy(false);
      }
    },
    [walletClient, publicClient, isContractDeployed, contractAddress, getPollCount]
  );

  /**
   * Transaction: Lean BOT behind an option.
   */
  const lean = useCallback(
    async (
      pollId: bigint,
      optionIndex: number,
      amountEther: string,
      optionNames?: string[]
    ): Promise<void> => {
      if (!walletClient || !publicClient || !isContractDeployed) {
        throw new Error("Wallet not connected or contract not deployed.");
      }
      setIsBusy(true);
      setError(null);
      try {
        assertActiveChain(walletClient);
        const value = parseEther(amountEther);
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: leanAbi,
          functionName: "lean",
          args: [pollId, optionIndex],
          value,
        });
        await waitSuccess(publicClient, hash);
      } catch (err) {
        const msg = decodeContractError(err, optionNames);
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsBusy(false);
      }
    },
    [walletClient, publicClient, isContractDeployed, contractAddress]
  );

  /**
   * Transaction: Release locked BOT stake.
   */
  const release = useCallback(
    async (pollId: bigint, optionNames?: string[]): Promise<void> => {
      if (!walletClient || !publicClient || !isContractDeployed) {
        throw new Error("Wallet not connected or contract not deployed.");
      }
      setIsBusy(true);
      setError(null);
      try {
        assertActiveChain(walletClient);
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: leanAbi,
          functionName: "release",
          args: [pollId],
        });
        await waitSuccess(publicClient, hash);
      } catch (err) {
        const msg = decodeContractError(err, optionNames);
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsBusy(false);
      }
    },
    [walletClient, publicClient, isContractDeployed, contractAddress]
  );

  /**
   * Transaction: Withdraw pending pull-payment till balance.
   */
  const withdraw = useCallback(async (): Promise<void> => {
    if (!walletClient || !publicClient || !isContractDeployed) {
      throw new Error("Wallet not connected or contract not deployed.");
    }
    setIsBusy(true);
    setError(null);
    try {
      assertActiveChain(walletClient);
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: leanAbi,
        functionName: "withdraw",
      });
      await waitSuccess(publicClient, hash);
    } catch (err) {
      const msg = decodeContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsBusy(false);
    }
  }, [walletClient, publicClient, isContractDeployed, contractAddress]);

  return {
    isContractDeployed,
    contractAddress,
    isBusy,
    error,
    clearError: () => setError(null),
    getPollCount,
    getPoll,
    getStake,
    getLatestPolls,
    getPending,
    getHoldersCount,
    createPoll,
    lean,
    release,
    withdraw,
  };
}
