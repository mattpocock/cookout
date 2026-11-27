import { Option, Predicate, Schema } from "effect";
import type { StoredLoginAlert, StoredLoginEvent } from "./inbox-alerts.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { SqlValue } from "./adapters/sql-database.ts";
import { adminActs } from "../../../inbox/index.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { isPublicId } from "../../../logins/index.ts";

const LOGIN_COLUMNS = "login_kind, credential_id, session_kind, where_from, client_ip, admin_name, admin_act, made_via";

const PublicIdColumn = Schema.String.pipe(Schema.refine(isPublicId));

const IdentityNameColumn = Schema.String.pipe(Schema.refine(isIdentityName));

const LoginColumns = {
  admin_act: Schema.NullOr(Schema.Literals(adminActs)),
  admin_name: Schema.NullOr(IdentityNameColumn),
  client_ip: Schema.NullOr(Schema.String),
  credential_id: Schema.NullOr(PublicIdColumn),
  login_kind: Schema.NullOr(Schema.Literals(["new session", "admin act"])),
  made_via: Schema.NullOr(Schema.Literal("login link")),
  session_kind: Schema.NullOr(Schema.Literals(["web", "cli"])),
  where_from: Schema.NullOr(Schema.String),
};

const LoginRow = Schema.Struct(LoginColumns);

type LoginRowType = typeof LoginRow.Type;

type LoginColumnValues = readonly [SqlValue, SqlValue, SqlValue, SqlValue, SqlValue, SqlValue, SqlValue, SqlValue];

function loginColumnValues(login: StoredLoginEvent): LoginColumnValues {
  if (login.kind === "admin act") {
    const { admin = null } = login;
    return [login.kind, login.credential, null, null, null, admin, login.act, null];
  }
  const { clientIp = null, via = null } = login;
  return [login.kind, login.session, login.sessionKind, login.where, clientIp, null, null, via];
}

function actingAdminOf(row: LoginRowType): { readonly admin?: IdentityName } {
  if (Predicate.isNull(row.admin_name)) {
    return {};
  }
  return { admin: row.admin_name };
}

function adminActOf(row: LoginRowType): Option.Option<StoredLoginEvent> {
  return Option.all({
    act: Option.fromNullOr(row.admin_act),
    credential: Option.fromNullOr(row.credential_id),
  }).pipe(Option.map((act) => ({ ...act, ...actingAdminOf(row), kind: "admin act" as const })));
}

function clientIpOf(row: LoginRowType): { readonly clientIp?: string } {
  if (Predicate.isNull(row.client_ip)) {
    return {};
  }
  return { clientIp: row.client_ip };
}

function viaOf(row: LoginRowType): { readonly via?: "login link" } {
  if (Predicate.isNull(row.made_via)) {
    return {};
  }
  return { via: row.made_via };
}

function newSessionOf(row: LoginRowType): Option.Option<StoredLoginEvent> {
  return Option.all({
    session: Option.fromNullOr(row.credential_id),
    sessionKind: Option.fromNullOr(row.session_kind),
    where: Option.fromNullOr(row.where_from),
  }).pipe(Option.map((session) => ({ ...session, ...clientIpOf(row), ...viaOf(row), kind: "new session" as const })));
}

function loginEventOf(row: LoginRowType): Option.Option<StoredLoginEvent> {
  if (row.login_kind === "admin act") {
    return adminActOf(row);
  }
  return newSessionOf(row);
}

type LoginAlertFields = Omit<StoredLoginAlert, "login">;

interface LoginAlertRow {
  readonly row: LoginRowType;
  readonly fields: LoginAlertFields;
}

function loginAlertOf({ fields, row }: LoginAlertRow): Option.Option<StoredLoginAlert> {
  return Option.map(loginEventOf(row), (login) => ({ ...fields, login }));
}

export { IdentityNameColumn, LOGIN_COLUMNS, LoginColumns, loginAlertOf, loginColumnValues };
