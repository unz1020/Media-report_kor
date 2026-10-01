export const MEDIA_MIX_MAX_BYTES = 30 * 1024 * 1024;
export function validateMediaMixFile(file: Pick<File, "size" | "name">) {
  if (file.size > MEDIA_MIX_MAX_BYTES) throw new Error("미디어믹스 파일은 30MB 이하로 올려주세요.");
  if (!/\.(xlsx|xls|xlsb|csv)$/i.test(file.name)) throw new Error("Excel 또는 CSV 파일을 선택해주세요.");
}
