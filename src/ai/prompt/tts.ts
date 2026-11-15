/**
 * 默认朗读风格：专业面试官语气（与 .env.example 中 MIMO_TTS_STYLE 的
 * 推荐配置保持一致）。env 未配置 MIMO_TTS_STYLE 时此默认值直接生效，
 * 禁止改成角色扮演式人设文案——面试官语音是功能性的，不是表演性的。
 */
export const TTS_STYLE =
  '请用专业、沉稳、清晰的面试官语气朗读，语速适中，自然连贯。';
