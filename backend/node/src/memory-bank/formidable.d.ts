/**
 * formidable.d.ts — formidable@3.5.4 自带 ESM/CJS 双发布但其类型入口与
 * 本仓 tsconfig（moduleResolution: node）解析不到 .d.ts（node_modules 里无
 * @types/formidable）。给一个最小面声明，只覆盖 memory-bank 用的 API。
 */
declare module 'formidable' {
  export interface FormidableFile {
    filepath: string;
    originalFilename: string | null;
    mimetype: string | null;
    size: number;
  }

  export interface FormidableOptions {
    maxFileSize?: number;
    maxFiles?: number;
    allowEmptyFiles?: boolean;
    minFileSize?: number;
    [key: string]: unknown;
  }

  export interface FormidableFields {
    [key: string]: string | string[] | undefined;
  }

  export interface FormidableFiles {
    [key: string]: FormidableFile[] | undefined;
  }

  interface Formidable {
    parse(
      req: unknown,
      callback: (
        err: Error | null,
        fields: FormidableFields,
        files: FormidableFiles,
      ) => void,
    ): void;
  }

  function formidable(options?: FormidableOptions): Formidable;
  export default formidable;
  export { Formidable, FormidableFile, FormidableFields, FormidableFiles, FormidableOptions };
}
