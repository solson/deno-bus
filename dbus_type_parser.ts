interface Invalid<_Msg extends string> {}

type DBusTypeParse<S extends string> =
    S extends `y${infer Rest}` ? [number, Rest] :
    S extends `s${infer Rest}` ? [string, Rest] :
    S extends `a{${infer Rest}` ? DBusTypeParseDict<Rest> :
    S extends `(${infer Rest}` ? DBusTypeParseDelim<Rest, ")"> :
    S extends `a${infer Rest}` ? Arrayify<DBusTypeParse<Rest>> :
    S extends `{${infer Rest}` ? Invalid<"unknown type '{' (did you mean 'a{'?)"> :
    S extends `${infer First}${infer Rest}` ? Invalid<`unknown type '${First}'`> :
    Invalid<`empty signature`>

type DBusTypeParseDelim<S extends string, D extends string, Elems extends unknown[] = []> =
    S extends `${D}${infer Rest}` ? [Elems, Rest] :
    DBusTypeParse<S> extends [infer T, infer Rest]
        ? (Rest extends string
            ? DBusTypeParseDelim<Rest, D, [...Elems, T]>
            : unknown)
        : (DBusTypeParse<S> extends Invalid<infer Msg>
            ? Invalid<`expected '${D}' or signature, got ${Msg}`>
            : unknown)

type DBusTypeParseDict<S extends string> =
    DBusTypeParseDelim<S, "}"> extends [infer Elems, infer Rest]
        ? (Elems extends unknown[] & { length: infer N }
            ? (N extends number
                ? (Elems extends [infer K, infer V]
                    ? [Map<K, V>, Rest]
                    : Invalid<`expected 2 signatures in dictionary, got ${N}`>)
                : unknown)
            : unknown)
        : DBusTypeParseDelim<S, "}">

type Arrayify<ParseResult> =
    ParseResult extends [infer T, infer Rest] ? [T[], Rest] :
    ParseResult extends Invalid<infer Msg> ? Invalid<`bad array element: ${Msg}`> :
    unknown;

export type DBusType<Sig extends string> =
    DBusTypeParse<Sig> extends [infer T, infer Rest]
        ? (Rest extends string
            ? (Rest extends "" ? T : Invalid<`unexpected trailing characters '${Rest}'`>)
            : unknown)
        : DBusTypeParse<Sig>;

type T1 = DBusType<"y">;
type T2 = DBusType<"s">;
type T3 = DBusType<"ay">;
type T4 = DBusType<"as">;
type T5 = DBusType<"aaay">;
type T6 = DBusType<"a()">;
type T7 = DBusType<"a(s)">;
type T8 = DBusType<"(ys)">;
type T9 = DBusType<"a(ysaay)">;
type T10 = DBusType<"(y(s(y(sy)s)y)s)">;
type T11 = DBusType<"a{ays}">;
type T12 = DBusType<"a{a{ys}a{sy}}">;
type T13 = DBusType<"a{s(ayas)}">;
type T14 = DBusType<"a(sa{ayas})">;

type E1 = DBusType<"">;
type E2 = DBusType<"z">;
type E3 = DBusType<"zzz">;
type E4 = DBusType<"ssss">;
type E5 = DBusType<"(">;
type E6 = DBusType<"(ys))">;
type E7 = DBusType<"a{sy">;
type E8 = DBusType<"(()">;
type E9 = DBusType<"(z)">;
type E10 = DBusType<"a{}">;
type E11 = DBusType<"a{s}">;
type E12 = DBusType<"a{sss}">;
type E13 = DBusType<"{ss}">;
type E14 = DBusType<"az">;
type E15 = DBusType<"a">;
type E16 = DBusType<"ayy">;
