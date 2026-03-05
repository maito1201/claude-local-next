import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

// jsdom does not provide TextEncoder/TextDecoder
Object.assign(globalThis, {
  TextEncoder,
  TextDecoder,
});

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();
