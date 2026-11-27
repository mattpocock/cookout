import { Alert, Skeleton } from "../../design-system/content.tsx";
import { Form, SubmitButton, TextField } from "../../design-system/controls.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import { LoggedIn } from "./logged-in.tsx";
import type { ReactNode } from "react";
import type { Refusal } from "../../sdk/index.ts";
import type { Session } from "../../board/index.ts";
import { useSyncExternalStore } from "react";

const TEXT = {
  button: "Log in",
  ended: "Your login ended after 90 days unused. Log in again.",
  field: "Token",
  form: "Log in",
} as const;

const LOGIN_EXPIRED = "login_expired";

function refusalLine(refusal: Refusal): string {
  if (refusal.code === LOGIN_EXPIRED) {
    return TEXT.ended;
  }
  return `Couldn't log in (${refusal.code}): ${refusal.message}`;
}

interface LoginFormProps {
  readonly session: Session;
}

export function LoginForm(props: LoginFormProps): ReactNode {
  const { session } = props;
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  if (state.status === "checking") {
    return (
      <CardBody>
        <Skeleton width="long" />
      </CardBody>
    );
  }
  if (state.status === "logged-in") {
    return <LoggedIn name={state.identity.name} />;
  }
  const handleLogIn = session.logIn;
  return (
    <>
      <Form field="token" label={TEXT.form} onSubmit={handleLogIn}>
        <TextField focused label={TEXT.field} name="token" />
        <SubmitButton disabled={state.status === "logging-in"}>{TEXT.button}</SubmitButton>
      </Form>
      {state.status === "logged-out" && state.refusal !== null && <Alert>{refusalLine(state.refusal)}</Alert>}
    </>
  );
}
