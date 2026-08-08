/**
 * 生成记录响应映射：
 * 前端“查看”需要生成后的简历 ID（实体中存于 generatedResumeId）；
 * 尚未生成完成时保留原 resumeId（选择已有简历时的源简历 ID）。
 */
export function toResumeRecordResponse<
  T extends { resumeId?: string; generatedResumeId?: string },
>(record: T): T {
  return {
    ...record,
    resumeId: record.generatedResumeId ?? record.resumeId,
  };
}
