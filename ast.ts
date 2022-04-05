
export type Stmt =
  | { tag: "define", name: string, value: Expr }
  | { tag: "expr", expr: Expr }

export type Expr =
    { tag: "num", value: number }
  | { tag: "id", name: string }
  // | { tag: ""}
  | { tag: "builtin1", name: string, arg: Expr }
  | { tag: "binOp", left: Expr, op: Op, right: Expr}
  | { tag: "builtin2", name: string, arg0: Expr, arg1: Expr}

export enum Op { Plus, Minus, Mul}