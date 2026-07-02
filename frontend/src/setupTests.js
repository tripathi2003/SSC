import '@testing-library/jest-dom';

const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});