/**
 * Decodes contract errors into user-friendly diagnostic messages matching spec §4.
 */
export function decodeContractError(err: unknown, optionNames?: string[]): string {
  if (!err) return "An unexpected error occurred.";

  const message = err instanceof Error ? err.message : String(err);

  // User rejection
  if (
    message.includes("User rejected") ||
    message.includes("User denied") ||
    message.includes("declined the request")
  ) {
    return "Transaction was cancelled in your wallet.";
  }

  // Spec-exact custom errors
  if (message.includes("WrongOption")) {
    const match = message.match(/WrongOption\((\d+)\)/);
    if (match) {
      const optIdx = parseInt(match[1], 10);
      const optName = optionNames && optionNames[optIdx] ? `"${optionNames[optIdx]}"` : `option #${optIdx + 1}`;
      return `You've locked BOT behind ${optName}. Release first to switch.`;
    }
    return "You've locked BOT behind another option. Release first to switch.";
  }

  if (message.includes("Ended")) {
    return "This poll has ended.";
  }

  if (message.includes("ZeroAmount")) {
    return "Must lock a non-zero amount of BOT.";
  }

  if (message.includes("BadQuestion")) {
    return "Question must be between 1 and 120 bytes.";
  }

  if (message.includes("BadOptions")) {
    return "Must have between 2 and 6 options, each 1 to 32 bytes.";
  }

  if (message.includes("BadDuration")) {
    return "Duration must be between 1 hour and 90 days.";
  }

  if (message.includes("BadOption")) {
    return "Selected option does not exist on this poll.";
  }

  if (message.includes("NoStake")) {
    return "You have no active stake to release on this poll.";
  }

  if (message.includes("NotFound")) {
    return "Poll not found.";
  }

  if (message.includes("NothingToWithdraw")) {
    return "No pending balance to withdraw.";
  }

  if (message.includes("TransferFailed")) {
    return "BOT transfer failed.";
  }

  if (message.includes("REENTRANCY")) {
    return "Reentrant call prevented.";
  }

  if (message.includes("insufficient funds")) {
    return "Insufficient BOT balance for transaction and gas.";
  }

  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
}
