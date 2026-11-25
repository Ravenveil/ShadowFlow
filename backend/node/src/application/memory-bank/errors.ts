/**
 * errors.ts — MemoryBankError 与 code→HTTP status 映射（对齐 Python :186-206）。
 *
 * Python 侧 HTTP 层把 MemoryBankError 转成 HTTPException(status, detail=to_dict())，
 * 错误体是 {"detail": {"code","message"}}。Node 版同时输出三份等价字段
 * （detail / error / code）——是 Python 的超集：老客户端读 detail，前端
 * memoryBank.ts 的 _extractErrorCode() 读 error.code / code 都能命中。
 */

export class MemoryBankError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'MemoryBankError';
    this.code = code;
    this.status = status;
  }

  toDict(): { code: string; message: string } {
    return { code: this.code, message: this.message };
  }
}

export function packNotFound(packId: string): MemoryBankError {
  return new MemoryBankError('PACK_NOT_FOUND', `Knowledge pack not found: ${packId}`, 404);
}

export function sourceNotFound(sourceId: string): MemoryBankError {
  return new MemoryBankError('SOURCE_NOT_FOUND', `Knowledge source not found: ${sourceId}`, 404);
}

export function isMemoryBankError(err: unknown): err is MemoryBankError {
  return err instanceof MemoryBankError;
}

/**
 * Express 错误中间件：MemoryBankError → status + 超集错误体；其余 → 500。
 * 挂在 memory-bank router 内部，不污染全局错误处理。
 */
export function memoryBankErrorHandler(
  err: unknown,
  _req: unknown,
  res: { status(n: number): { json(b: unknown): void } },
  next: (e?: unknown) => void,
): void {
  if (isMemoryBankError(err)) {
    const body = err.toDict();
    res.status(err.status).json({
      detail: body,
      error: body,
      code: err.code,
      message: err.message,
    });
    return;
  }
  next(err);
}
