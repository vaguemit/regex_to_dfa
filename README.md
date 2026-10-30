# Regex to DFA Lexer Generator
### An Interactive Tool for Visualizing Lexical Analysis

---

## 1. Description
This repository contains the complete implementation of the **Regex to DFA Lexer Generator**. The project implements the classical lexical analysis pipeline from first principles:

1. **Regular Expression Parsing**: Preprocessing character classes (e.g., `[a-zA-Z0-9_]`), inserting explicit concatenation operators, and converting infix regular expressions into postfix using Dijkstra's Shunting-Yard algorithm.
2. **Thompson's Construction**: Transforming postfix expressions into non-deterministic finite automata ($\varepsilon$-NFAs), with Dragon Book concatenation state merging to maintain linear state complexity.
3. **Automata Combination**: Merging multiple token rules under a single global start state with rule priority indices.
4. **Subset Construction**: Deterministic conversion of the combined NFA into a DFA using power-set calculation, $\varepsilon$-closures, and `move(T, a)`.
5. **DFA Minimization**: Applying Hopcroft-style partition refinement, initially partitioning non-accepting states and grouping accepting states strictly by token classification.
6. **Maximal Munch Scanning Engine**: Running the minimized DFA against input strings using the longest match rule, reporting lexical errors with 1-indexed line and column numbers, and recovering gracefully.
7. **Scanner Code Generator**: Exporting the minimized DFA into standalone C (`lexer.c`) and Python (`lexer.py`) scanner files.

---

## 2. Directory Structure

```
regex-dfa-lexer/
├── python_engine/              # Python reference implementation (course submission)
│   ├── regex_parser.py         # Shunting-yard postfix converter & character class expander
│   ├── nfa_builder.py          # Thompson's construction and rule combiner
│   ├── dfa_builder.py          # Subset construction using frozensets
│   ├── minimizer.py            # Hopcroft partition refinement minimizer
│   ├── lexer_engine.py         # Maximal munch scanner with line/column tracking
│   ├── code_exporter.py        # Generates standalone C and Python lexers
│   ├── test_suite.py           # Unit tests validating Section 9 & 10 from the report
│   ├── cli.py                  # Command-line driver
│   └── server.py               # Local API server
├── src/                        # Interactive visualization interface (React + Vite)
│   ├── engine/                 # Client-side compiler algorithms
│   │   ├── regexParser.js
│   │   ├── nfaBuilder.js
│   │   ├── dfaBuilder.js
│   │   ├── minimizer.js
│   │   ├── lexerEngine.js
│   │   └── codeExporter.js
│   ├── components/
│   │   ├── GraphVisualizer.jsx # Graphviz SVG renderer with zoom/pan
│   │   ├── SimulationPanel.jsx # Maximal munch tape & state playback
│   │   ├── TransitionTableView.jsx # State transition matrices
│   │   ├── CodeExporterView.jsx# Standalone scanner viewer & exporter
│   │   └── Presets.js          # Course report presets
│   ├── App.jsx                 # Workbench layout
│   └── index.css               # Clean IDE styling
├── package.json
└── vite.config.js
```

---

## 3. Running the Project

### A. Python Reference Engine & Tests
The core algorithms are implemented in Python 3 without requiring external libraries.

```bash
# Navigate to the python directory
cd python_engine

# Run the unit tests (verifies Section 9 and Section 10 examples)
python test_suite.py

# Run CLI with the Section 10 sample
python cli.py --preset sample

# Run CLI with the Section 9 worked example ((a|b)*abb)
python cli.py --preset worked_example

# Run CLI with custom input and export standalone C code
python cli.py --preset sample --input "if (count1 >= 42) return 3.14;" --export-c lexer.c
```

#### Compiling the Exported C Lexer
```bash
gcc -O2 -o lexer lexer.c
./lexer "if (count1 >= 42) return 3.14;"
```

---

### B. Interactive Visualizer Interface
An interactive GUI built using React and WebAssembly Graphviz (`@viz-js/viz`):

```bash
# From project root
npm run dev
```

Open `http://localhost:5173/` in your browser.

The interface provides:
- Two-column workbench layout with token rule editor on the left and workspace on the right.
- High-resolution SVG graph rendering for Thompson NFA, Subset DFA, and Minimized DFA.
- Step-by-step Maximal Munch playback with interactive tape pointer and state tracking.
- Searchable state transition tables.
- C and Python standalone scanner export.

---

## 4. Verification and Benchmark

### Worked Example (Report Section 9): `(a|b)*abb`
- **Thompson NFA**: 11 states (0 to 10)
- **Subset DFA**: 5 states ($A, B, C, D, E$ where $E$ accepts)
- **Minimized DFA**: 4 states ($S_0 = \{A, C\}, S_1 = B, S_2 = D, S_3 = E$)
- **Transition Table**:
  - $S_0$: on `a` $\rightarrow S_1$, on `b` $\rightarrow S_0$
  - $S_1$: on `a` $\rightarrow S_1$, on `b` $\rightarrow S_2$
  - $S_2$: on `a` $\rightarrow S_1$, on `b` $\rightarrow S_3$
  - $S_3$: on `a` $\rightarrow S_1$, on `b` $\rightarrow S_0$

### Sample Input (Report Section 10):
```
KEYWORD if|else|while|return
ID [a-zA-Z_][a-zA-Z0-9_]*
NUM [0-9]+(\.[0-9]+)?
OP >=|<=|==|!=|[+\-*/<>=]
PUNCT [(){};,]
WS [ \t\n]+ (ignore)
```
Input: `if (count1 >= 42) return 3.14;`  
Produced tokens:
`KEYWORD(if)`, `PUNCT(()`, `ID(count1)`, `OP(>=)`, `NUM(42)`, `PUNCT())`, `KEYWORD(return)`, `NUM(3.14)`, `PUNCT(;)`

All tests pass with 100% agreement.
