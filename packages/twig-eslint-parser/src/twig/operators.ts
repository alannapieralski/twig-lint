export type Associativity = 'left' | 'right';
export type BinaryOperator = {
  readonly precedence: number;
  readonly associativity: Associativity;
  readonly nodeType: 'BinaryExpression' | 'LogicalExpression' | 'SequenceExpression' | 'AssignmentExpression';
  readonly estreeOperator: string;
};
export type PrefixOperator = {
  readonly precedence: number;
  readonly operandPrecedence: number;
  readonly nodeType: 'UnaryExpression' | 'SpreadElement';
  readonly estreeOperator: string;
};

const binary = (precedence: number, estreeOperator: string): BinaryOperator => ({ precedence, associativity: 'left', nodeType: 'BinaryExpression', estreeOperator });
const logical = (precedence: number, estreeOperator: string, associativity: Associativity = 'left'): BinaryOperator => ({ precedence, associativity, nodeType: 'LogicalExpression', estreeOperator });
const sequence = (precedence: number): BinaryOperator => ({ precedence, associativity: 'left', nodeType: 'SequenceExpression', estreeOperator: ',' });

export const BINARY_OPERATORS: Readonly<Record<string, BinaryOperator>> = {
  '=': { precedence: 0, associativity: 'right', nodeType: 'AssignmentExpression', estreeOperator: '=' },
  '?:': logical(5, '||', 'right'),
  '? :': logical(5, '||', 'right'),
  'or': logical(10, '||'),
  'xor': binary(12, '^'),
  'and': logical(15, '&&'),
  'b-or': binary(16, '|'),
  'b-xor': binary(17, '^'),
  'b-and': binary(18, '&'),
  '==': binary(20, '=='),
  '!=': binary(20, '!='),
  '<=>': binary(20, '=='),
  '<': binary(20, '<'),
  '>': binary(20, '>'),
  '>=': binary(20, '>='),
  '<=': binary(20, '<='),
  'not in': binary(20, '!='),
  'in': binary(20, '=='),
  'matches': binary(20, '=='),
  'starts with': binary(20, '=='),
  'ends with': binary(20, '=='),
  'has some': sequence(20),
  'has every': sequence(20),
  '===': binary(20, '==='),
  '!==': binary(20, '!=='),
  '..': binary(25, '+'),
  '+': binary(30, '+'),
  '-': binary(30, '-'),
  '~': binary(40, '+'),
  '*': binary(60, '*'),
  '/': binary(60, '/'),
  '//': binary(60, '/'),
  '%': binary(60, '%'),
  '**': { ...binary(200, '**'), associativity: 'right' },
  '??': logical(300, '??', 'right'),
};

export const PREFIX_OPERATORS: Readonly<Record<string, PrefixOperator>> = {
  'not': { precedence: 50, operandPrecedence: 50, nodeType: 'UnaryExpression', estreeOperator: '!' },
  '-': { precedence: 500, operandPrecedence: 500, nodeType: 'UnaryExpression', estreeOperator: '-' },
  '+': { precedence: 500, operandPrecedence: 500, nodeType: 'UnaryExpression', estreeOperator: '+' },
  '...': { precedence: 512, operandPrecedence: 0, nodeType: 'SpreadElement', estreeOperator: '...' },
};

export const TERNARY_PRECEDENCE = 0;
export const TEST_PRECEDENCE = 100;
export const ARROW_PRECEDENCE = 250;
export const POSTFIX_PRECEDENCE = 512;

export const TWIG_OPERATORS: readonly string[] = [...new Set([
  ...Object.keys(PREFIX_OPERATORS).filter((operator) => operator !== '...'),
  ...Object.keys(BINARY_OPERATORS),
  '?.',
])];
