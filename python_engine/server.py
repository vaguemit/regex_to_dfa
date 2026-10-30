"""
server.py
Zero-dependency HTTP API server for the Regex to DFA Lexer Generator.
Serves POST /api/process to run the complete pipeline and return JSON results.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.parse
from regex_parser import regex_to_postfix
from nfa_builder import combine_token_rules, TokenRule
from dfa_builder import build_subset_dfa
from minimizer import minimize_dfa
from lexer_engine import LexerEngine
from code_exporter import export_to_c, export_to_python

PORT = 5050

class LexerAPIHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        if self.path == '/api/health':
            self._set_headers(200)
            self.wfile.write(json.dumps({"status": "ok", "service": "regex-dfa-lexer"}).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode('utf-8'))

    def do_POST(self):
        if self.path == '/api/process':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                data = json.loads(post_data.decode('utf-8'))
                rules_raw = data.get('rules', [])
                source_code = data.get('source', '')

                # Parse rules
                parsed_rules = []
                for idx, r in enumerate(rules_raw):
                    name = r.get('name', f'RULE_{idx}').strip()
                    pattern = r.get('pattern', '').strip()
                    is_ignored = bool(r.get('isIgnored', False))
                    parsed_rules.append(TokenRule(name, pattern, is_ignored=is_ignored, priority=idx))

                if not parsed_rules:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({"error": "No rules provided"}).encode('utf-8'))
                    return

                # Run pipeline
                combined_nfa = combine_token_rules(parsed_rules)
                dfa = build_subset_dfa(combined_nfa)
                min_dfa = minimize_dfa(dfa)

                lexer = LexerEngine(min_dfa)
                tokens, errors, trace = lexer.tokenize(source_code)

                token_names = [r.name for r in parsed_rules]
                c_code = export_to_c(min_dfa, token_names)
                py_code = export_to_python(min_dfa, token_names)

                response = {
                    "success": True,
                    "metrics": {
                        "nfaStates": len(combined_nfa.states),
                        "dfaStates": len(dfa.states),
                        "minDfaStates": len(min_dfa.states),
                        "reductionPercent": round((1 - len(min_dfa.states) / max(1, len(combined_nfa.states))) * 100, 1)
                    },
                    "nfa": {
                        **combined_nfa.to_json(),
                        "dot": combined_nfa.to_dot("Combined NFA")
                    },
                    "dfa": {
                        **dfa.to_json(),
                        "dot": dfa.to_dot("Subset DFA")
                    },
                    "minDfa": {
                        **min_dfa.to_json(),
                        "dot": min_dfa.to_dot("Minimized DFA")
                    },
                    "tokens": [t.to_dict() for t in tokens],
                    "errors": [e.to_dict() for e in errors],
                    "trace": trace,
                    "export": {
                        "c": c_code,
                        "python": py_code
                    }
                }

                self._set_headers(200)
                self.wfile.write(json.dumps(response).encode('utf-8'))

            except Exception as e:
                import traceback
                self._set_headers(500)
                self.wfile.write(json.dumps({
                    "success": False,
                    "error": str(e),
                    "traceback": traceback.format_exc()
                }).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode('utf-8'))

def run_server():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, LexerAPIHandler)
    print(f"Regex to DFA Lexer API Server running on http://localhost:{PORT}")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()
