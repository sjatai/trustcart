export type TrustEyeDebug = {
    lastSuccessfulStep?: string;
    lastReceiptId?: string;
    failedAgent?: string;
    errorStage?: string;
  };
  
  export function attachDebug(err: unknown, debug: TrustEyeDebug) {
    if (err && typeof err === "object") {
      (err as any).trusteyeDebug = debug;
    }
    return err;
  }
  
  export function getAttachedDebug(err: unknown): TrustEyeDebug | undefined {
    if (err && typeof err === "object") return (err as any).trusteyeDebug;
    return undefined;
  }