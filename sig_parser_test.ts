import { parseSig, parseSigs } from "./sig_parser.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.98.0/testing/asserts.ts";
import type { DBusType2 } from "./dbus_types.ts";

function byte(): DBusType2 {
  return { type: "y" };
}

function bool(): DBusType2 {
  return { type: "b" };
}

function string(): DBusType2 {
  return { type: "s" };
}

function array(elemType: DBusType2): DBusType2 {
  return { type: "a", elemType };
}

function struct(...fieldTypes: DBusType2[]): DBusType2 {
  return { type: "r", fieldTypes };
}

Deno.test("parseSig", () => {
  assertEquals<DBusType2>(parseSig("y"), byte());

  assertEquals<DBusType2>(
    parseSig("aaaaaay"),
    array(array(array(array(array(array(byte())))))),
  );

  assertEquals<DBusType2>(
    parseSig("a(ybnqiuxt)"),
    array(struct(
      { type: "y" },
      { type: "b" },
      { type: "n" },
      { type: "q" },
      { type: "i" },
      { type: "u" },
      { type: "x" },
      { type: "t" },
    )),
  );

  assertEquals<DBusType2>(
    parseSig("(y(b(ss)b)y)"),
    struct(byte(), struct(bool(), struct(string(), string()), bool()), byte()),
  );

  assertThrows(
    () => parseSig("ayy"),
    RangeError,
    "unexpected trailing characters 'y'",
  );

  assertThrows(
    () => parseSig("yyas"),
    RangeError,
    "unexpected trailing characters 'yas'",
  );

  assertThrows(
    () => parseSig("{"),
    RangeError,
    "unknown type '{' (did you mean 'a{'?)",
  );
});

Deno.test("parseSigs", () => {
  assertEquals<DBusType2[]>(
    parseSigs("ayy"),
    [array(byte()), byte()],
  );

  assertEquals<DBusType2[]>(
    parseSigs("yyas"),
    [byte(), byte(), array(string())],
  );
});
