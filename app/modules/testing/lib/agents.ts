import type {
  CookoutClient,
  CreateIdentityRequest,
  IdentityResponse,
  IdentityWithTokenResponse,
} from "../../sdk/index.ts";

interface TestAgentRequest {
  readonly by: CookoutClient;
  readonly keyBy?: CookoutClient;
  readonly name: string;
  readonly owner?: string;
  readonly displayName?: string | null;
  readonly description?: string;
  readonly broughtIn?: true;
}

type CreatedTestAgent<Request extends TestAgentRequest> = Request extends { readonly broughtIn: true }
  ? IdentityResponse
  : IdentityWithTokenResponse;

const TEST_KEY = "test";
const BETWEEN_WORDS = /[^\p{L}\p{N}]+/u;
const FIRST_LETTER = /^\p{Ll}/u;

function testAgentDisplayName(name: string): string {
  const words = name.split(BETWEEN_WORDS).filter((word) => word !== "");
  return words.map((word) => word.replace(FIRST_LETTER, (letter) => letter.toUpperCase())).join(" ");
}

function asked(request: TestAgentRequest): Omit<CreateIdentityRequest, "kind"> {
  const {
    by: _by,
    broughtIn: _broughtIn,
    keyBy: _keyBy,
    displayName = testAgentDisplayName(request.name),
    ...rest
  } = request;
  if (displayName === null) {
    return rest;
  }
  return { ...rest, displayName };
}

function broughtInAsAsked<Request extends TestAgentRequest>(
  answer: IdentityResponse,
): answer is CreatedTestAgent<Request> {
  return !("token" in answer);
}

function keyedAsAsked<Request extends TestAgentRequest>(answer: IdentityResponse): answer is CreatedTestAgent<Request> {
  return "token" in answer;
}

type TestKey = IdentityWithTokenResponse["token"];

async function ownerKey({ by, owner }: TestAgentRequest, name: string): Promise<TestKey> {
  const { identity: creator } = await by.whoami();
  if (typeof owner !== "string" || owner === creator.name) {
    const { token } = await by.createAgentKey(name, { name: TEST_KEY });
    return token;
  }
  await by.transferAgent(name, creator.name);
  const { token } = await by.createAgentKey(name, { name: TEST_KEY });
  await by.transferAgent(name, owner);
  return token;
}

async function testKeyFor(request: TestAgentRequest, name: string): Promise<TestKey> {
  if (typeof request.keyBy === "object") {
    const { token } = await request.keyBy.createAgentKey(name, { name: TEST_KEY });
    return token;
  }
  const token = await ownerKey(request, name);
  return token;
}

async function keyedAgent(request: TestAgentRequest): Promise<IdentityWithTokenResponse> {
  const { identity } = await request.by.createIdentity({ ...asked(request), kind: "agent" });
  const token = await testKeyFor(request, identity.name);
  return { identity, token };
}

async function createTestAgent<const Request extends TestAgentRequest>(
  request: Request,
): Promise<CreatedTestAgent<Request>> {
  if (request.broughtIn !== true) {
    const keyed = await keyedAgent(request);
    if (keyedAsAsked<Request>(keyed)) {
      return keyed;
    }
  }
  const brought = await request.by.createAgentForOwner(asked(request));
  if (broughtInAsAsked<Request>(brought)) {
    return brought;
  }
  throw new TypeError(
    `${request.name} came back with a token, though an agent brought it in, and gets one only from a join.`,
  );
}

export { type CreatedTestAgent, type TestAgentRequest, createTestAgent, testAgentDisplayName };
