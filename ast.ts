
export type Stmt<A> =
  // x = 10
  | { a ?: A, tag: "assign", name: string, value: Expr<A> }
  | { a ?: A, tag: "memberAssign", member: Expr<A>, value: Expr<A> }
  | { a ?: A, tag: "expr", expr: Expr<A> }
  | { a ?: A, tag: "pass"}
  | { a ?: A, tag: "return", ret: Expr<A>}
  | { a ?: A, tag: "if", cond: Expr<A>, ifStmts: Stmt<A>[], elseStmts: Stmt<A>[]}
  | { a ?: A, tag: "while", cond: Expr<A>, stmts: Stmt<A>[]}

export type Expr<A> =
    { a ?: A, tag: "literal", literal: Literal<A> }
  | { a ?: A, tag: "id", name: string }
  | { a ?: A, tag: "builtin1", name: string, arg: Expr<A> }
  | { a ?: A, tag: "binOp", left: Expr<A>, op: BinOp, right: Expr<A>}
  | { a ?: A, tag: "UniOp", op: UniOp, arg: Expr<A>}
  | { a ?: A, tag: "Parenthesis", e: Expr<A>}
  | { a ?: A, tag: "builtin2", name: string, arg0: Expr<A>, arg1: Expr<A>}
  | { a ?: A, tag: "call", name: string, args: Expr<A>[], isFunc?: boolean } // a function or a contructor
  | { a ?: A, tag: "classVar", objName: Expr<A>, varName: string}
  | { a ?: A, tag: "classMethod", objName: Expr<A>, methodName: string, args: Expr<A>[]}

export enum BinOp { Plus, Minus, Mul, Div, Mod, Eq, NE, LTE, GTE, LT, GT, Is}

export enum UniOp { Not, UMinus}

// export enum Type {int, bool, none, {tag: "object", class: string}}
export type Type = 
  | "int"
  | "bool"
  | "none"
  | {tag: "object", class: string}



export type Program<A> = { a ?: A, vardefs: VarDef<A>[], funcdefs: FuncDef<A>[], stmts: Stmt<A>[], classdefs: ClassDef<A>[] }

// x: int  = 1
export type VarDef<A> = { a ?: A, typedvar: TypedVar<A>, literal: Literal<A> }

// x: int
export type TypedVar<A> = { a ?: A, name: string, type: Type }

// 1/ True/ False / None
export type Literal<A> = 
    { a ?: A, tag: "num", value: number }
  | { a ?: A, tag: "bool", value: boolean }
  | { a ?: A, tag: "none" }  // the initial value of a object, just like a null pointer

export type FuncDef<A> = { a ?: A, name: string, params: TypedVar<A>[], ret: Type, vardefs: VarDef<A>[], stmts: Stmt<A>[] }

export type ClassDef<A> = { a ?: A, name: string, vardefs: VarDef<A>[], methoddefs: FuncDef<A>[] }