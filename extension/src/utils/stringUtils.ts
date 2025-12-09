export const truncateByBytes = (str: string, maxBytes: number): string => {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  if (encoded.length <= maxBytes) {
    return str;
  }
  const truncated = encoded.slice(0, maxBytes);
  const decoder = new TextDecoder();
  let result = decoder.decode(truncated);

  // Verify result size
  // Replacement characters might increase the size slightly
  while (encoder.encode(result).length > maxBytes) {
     result = result.slice(0, -1);
  }
  return result;
};
