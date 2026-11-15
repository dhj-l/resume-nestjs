'use strict';

// ansi-styles@6 是纯 ESM 包，Jest(CJS) 无法直接加载。
// LangChain 的 ConsoleCallbackHandler 只用到 .open/.close 做终端着色，
// 测试环境用空样式替身即可，避免破坏所有引入 @langchain/core 的测试。
const plain = { open: '', close: '' };

const colors = {};
[
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'blackBright',
  'redBright',
  'greenBright',
  'yellowBright',
  'blueBright',
  'magentaBright',
  'cyanBright',
  'whiteBright',
  'gray',
  'grey',
].forEach((name) => {
  colors[name] = plain;
});

const modifiers = {};
[
  'bold',
  'dim',
  'italic',
  'underline',
  'inverse',
  'hidden',
  'strikethrough',
].forEach((name) => {
  modifiers[name] = plain;
});

const styleNamespace = {
  ...colors,
  ...modifiers,
  color: { ...colors },
  modifier: { ...modifiers },
};

module.exports = {
  __esModule: true,
  default: styleNamespace,
  ...styleNamespace,
};
