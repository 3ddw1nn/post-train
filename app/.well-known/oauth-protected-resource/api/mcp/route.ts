// Path-suffixed form of the protected-resource metadata. A client that skips
// the WWW-Authenticate header probes this before the root document (the MCP
// spec has it first in the fallback order), because our MCP endpoint lives at
// a path rather than the origin root.
export { GET } from "../../route";
