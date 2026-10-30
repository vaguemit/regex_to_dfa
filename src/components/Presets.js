/**
 * Presets.js
 * Standard token specifications.
 */

export const PRESETS = {
  section10: {
    id: "section10",
    name: "Sample C-Like Lexer",
    rules: [
      { name: "KEYWORD", pattern: "if|else|while|return", isIgnored: false },
      { name: "ID", pattern: "[a-zA-Z_][a-zA-Z0-9_]*", isIgnored: false },
      { name: "NUM", pattern: "[0-9]+(\\.[0-9]+)?", isIgnored: false },
      { name: "OP", pattern: ">=|<=|==|!=|[+\\-*/<>=]", isIgnored: false },
      { name: "PUNCT", pattern: "[(){};,]", isIgnored: false },
      { name: "WS", pattern: "[ \\t\\n]+", isIgnored: true }
    ],
    source: "if (count1 >= 42) return 3.14;"
  },

  worked_example: {
    id: "worked_example",
    name: "Worked Example: (a|b)*abb",
    rules: [
      { name: "MATCH", pattern: "(a|b)*abb", isIgnored: false },
      { name: "WS", pattern: "[ \\t\\n]+", isIgnored: true }
    ],
    source: "ababb babb aabb"
  },

  arithmetic: {
    id: "arithmetic",
    name: "Arithmetic Expressions",
    rules: [
      { name: "FLOAT", pattern: "[0-9]+\\.[0-9]+", isIgnored: false },
      { name: "INT", pattern: "[0-9]+", isIgnored: false },
      { name: "VAR", pattern: "[a-zA-Z]+", isIgnored: false },
      { name: "ASSIGN", pattern: "=", isIgnored: false },
      { name: "OP", pattern: "[+\\-*/]", isIgnored: false },
      { name: "PAREN", pattern: "[()]", isIgnored: false },
      { name: "WS", pattern: "[ \\t\\n]+", isIgnored: true }
    ],
    source: "result = (val + 10.5) * 4"
  },

  error_demo: {
    id: "error_demo",
    name: "Lexical Error Recovery",
    rules: [
      { name: "KEYWORD", pattern: "let|const", isIgnored: false },
      { name: "ID", pattern: "[a-zA-Z_][a-zA-Z0-9_]*", isIgnored: false },
      { name: "OP", pattern: "==|=", isIgnored: false },
      { name: "NUM", pattern: "[0-9]+", isIgnored: false },
      { name: "WS", pattern: "[ \\t\\n]+", isIgnored: true }
    ],
    source: "let x = 5 @ 2;"
  }
};
