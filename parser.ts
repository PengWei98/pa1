import {parser} from "lezer-python";
import {TreeCursor} from "lezer-tree";
import { Func } from "mocha";
import { createClassifier } from "typescript";
// import {Expr, Op, Stmt} from "./ast";
import { Program, Type, Expr, Literal, VarDef, FuncDef, Stmt, BinOp, UniOp, ClassDef, MethodDef } from "./ast";
import { typeCheckFuncDef } from "./typecheck";

export function traversArgs(c : TreeCursor, s : string) : Expr<null>[] {
  var args: Expr<null>[] = [];
  c.firstChild();
  while(c.nextSibling()){
    args.push(traverseExpr(c, s));
    c.nextSibling();
  }
  // c.nextSibling();
  // const arg = traverseExpr(c, s);
  c.parent();
  return args;
}

export function traverseExpr(c : TreeCursor, s : string) : Expr<null> {
  switch(c.type.name) {
    case "Number":
      return {
        tag: "literal",
        literal: {tag: "num", value: Number(s.substring(c.from, c.to))}
      }
    case "Boolean":
      return {
        tag: "literal",
        literal: {tag: "bool", value: s.substring(c.from, c.to) == "True" ? true : false}
      }
    case "None":
      return {
        tag: "literal",
        literal: {tag: "none"}
      }
    case "VariableName":
      return {
        tag: "id",
        name: s.substring(c.from, c.to)
      }
    case "UnaryExpression":
      c.firstChild();
      var uop;
      switch(s.substring(c.from, c.to)) {
        case "not":
          uop = UniOp.Not;
          break;
        case "-":
          uop = UniOp.UMinus;
          break;
      }
      c.nextSibling();
      const arg = traverseExpr(c, s);
      c.parent();
      return { tag: "UniOp", op: uop, arg};
    case "BinaryExpression":
      c.firstChild();
      const left = traverseExpr(c, s);
      c.nextSibling();
      var op: BinOp;
      switch(s.substring(c.from, c.to)) {
        case "+":
          op = BinOp.Plus;
          break;
        case "-":
          op = BinOp.Minus;
          break;
        case "*":
          op = BinOp.Mul;
          break;
        case "//":
          op = BinOp.Div;
          break;
        case "%":
          op = BinOp.Mod;
          break;
        case "==":
          op = BinOp.Eq;
          break;
        case "!=":
          op = BinOp.NE;
          break;
        case "<=":
          op = BinOp.LTE;
          break;
        case ">=":
          op = BinOp.GTE;
          break;
        case "<":
          op = BinOp.LT;
          break;
        case ">":
          op = BinOp.GT;
          break;
        case "is":
          op = BinOp.Is;
          break;
        default:
          throw new Error("Invalid Op");
      }
      c.nextSibling();
      const right = traverseExpr(c, s);
      c.parent();
      return { tag: "binOp", left, op, right};
    case "CallExpression":
      c.firstChild();
      const funcName = s.substring(c.from, c.to);
      c.nextSibling();
      const argList = new Array<Expr<null>>();
      if (s.substring(c.from, c.to).length > 2) {
        c.firstChild();
        while (c.nextSibling()) {
          argList.push(traverseExpr(c, s));
          c.nextSibling();
        }
        c.parent();
      }
      c.parent();
      if (funcName === "print" || funcName == "abs"){
        return {
          tag: "builtin1",
          name: funcName,
          arg: argList[0]
        };
      }else{
        return {
          tag: "call",
          name: funcName,
          args: argList
        }
      }
    default:
      throw new Error("Could not parse expr at " + c.from + " " + c.to + ": " + s.substring(c.from, c.to));
  }
}



export function traverseStmt(c : TreeCursor, s : string, program : Program<null> | FuncDef<null> | ClassDef<null>) : Stmt<null> | VarDef<null> | FuncDef<null> | ClassDef<null>{
  switch(c.node.type.name) {
    case "AssignStatement":
      c.firstChild(); // go to name
      const name = s.substring(c.from, c.to);
      c.nextSibling(); // go to equals
      const node = c.node;

      if (node.type.name !== "TypeDef"){
        //  assignment
        c.nextSibling(); // go to value
        const value = traverseExpr(c, s);
        c.parent();
        const st: Stmt<null> = {
          tag: "assign",
          name: name,
          value: value
        };
        return st;
      }
      else {
        // initialize new variable
        c.firstChild();
        c.nextSibling();
        var type;
        if (s.substring(c.from, c.to) === "int"){
          type = "int";
        }
        else if (s.substring(c.from, c.to) === "bool"){
          type = "bool";
        } 
        else {
          // define a class
          const className: string = s.substring(c.from, c.to);
          type = {tag: "object", class: className}
        }
        c.parent();
        c.nextSibling();
        c.nextSibling();
        var literal: Literal<null>;
        const value = traverseExpr(c, s);
        if (c.type.name === "Number"){
          literal = {tag: "num", value: Number(s.substring(c.from, c.to))};
        }
        else if (c.type.name === "Boolean"){
          literal = {tag: "bool", value: s.substring(c.from, c.to) == "True" ? true : false};
        }
        else if (c.type.name === "None") {
          literal = {tag: "none"}
        }
        c.parent();
        const varDef = {
          typedvar: {name, type: type as Type},
          literal
        }
        program.vardefs.push(varDef);

        // todo: is the object null is OK?
        const st: Stmt<null> = {
          tag: "assign",
          name: name,
          value: value
        };
        return st;
      }
    case "PassStatement":
      return { tag: "pass" }
    case "ReturnStatement":
      c.firstChild();
      c.nextSibling();
      var val: Expr<null>;
      if (s.substring(c.from, c.to).length != 0){
        val = traverseExpr(c, s);
      }
      else{
        val = { tag: "literal", literal: {tag: "none" }}
      }
      c.parent();
      return {
        tag: "return",
        ret: val
      }
    case "ExpressionStatement":
      c.firstChild();
      const expr = traverseExpr(c, s);
      c.parent(); // pop going into stmt
      return { tag: "expr", expr: expr }
    case "IfStatement":
      c.firstChild();
      c.nextSibling();
      const ifCond: Expr<null> = traverseExpr(c, s);
      c.nextSibling();
      c.firstChild();
      const ifStmts: Stmt<null>[] = [];
      const elseStmts: Stmt<null>[] = [];
      while(c.nextSibling()){
        const ist = traverseStmt(c, s, program);
        if (isStmt(ist)){
          ifStmts.push(ist);
        }
      }
      c.parent();
      if (c.nextSibling()) {
        // hasElse = true;
        c.nextSibling();
        c.firstChild();
        while (c.nextSibling()){
          const est = traverseStmt(c, s, program);
          if (isStmt(est)){
            elseStmts.push(est);
          }
        }
        c.parent();
      }
      c.parent();
      return {tag: "if", cond: ifCond, ifStmts, elseStmts};
    case "WhileStatement":
      c.firstChild();
      c.nextSibling();
      const whileCond: Expr<null> = traverseExpr(c, s);
      c.nextSibling();
      c.firstChild();
      const whileStmts: Stmt<null>[] = [];
      while(c.nextSibling()){
        const ist = traverseStmt(c, s, program);
        if (isStmt(ist)){
          whileStmts.push(ist);
        }
      }
      c.parent();
      c.parent();
      return {tag: "while", cond: whileCond, stmts: whileStmts};
    case "FunctionDefinition":
      c.firstChild();
      c.nextSibling();
      const funcName = s.substring(c.from, c.to);
      c.nextSibling();
      const p = s.substring(c.from, c.to).slice(1, -1);
      const params = p.length > 0 ? p.split(",")
        .map(item => ({
          name: item.trim().split(":")[0].trim(),
          type: (item.trim().split(":")[1].trim() == "int" ? "int" : (item.trim().split(":")[1].trim() == "bool" ? "bool" : "none") as Type)
        }
        )) : [];
      c.nextSibling();
      var ret = "none";
      var retStr = s.substring(c.from, c.to).replace("->", "").trim();
      if (retStr === "int"){
        ret = "int";
      }
      if (retStr == "bool"){
        ret = "bool";
      }
      c.nextSibling();
      c.firstChild();
      const func: FuncDef<null> = { name: funcName, params, ret: ret as Type, vardefs: [], stmts: [] }
      while(c.nextSibling()){
        const st = traverseStmt(c, s, func);
        if (isStmt(st)){
          func.stmts.push(st);
        }
        // todo: ????
        if (isVarDef(st)){
          func.vardefs.push(st);
        }
      }
      if (isProgram(program)){
        program.funcdefs.push(func);
      }
      c.parent();
      c.parent();
      return func;
    case "ClassDefinition":
      c.firstChild();
      c.nextSibling();
      const className = s.substring(c.from, c.to);
      c.nextSibling();
      c.nextSibling();
      c.firstChild();
      const cls: ClassDef<null> = { name: className, vardefs: [], methoddefs: []}
      while(c.nextSibling()){
        const st = traverseStmt(c, s, cls);
        // todo: ????
        if (isVarDef(st)){
          cls.vardefs.push(st);
        }
        // todo; ????
        if (isMethodDef(st)){
          cls.methoddefs.push(st);
        }
      }
      if (isProgram(program)){
        program.classdefs.push(cls);
      }
      c.parent();
      c.parent();
      return cls;
    default:
      throw new Error("Could not parse stmt at " + c.node.from + " " + c.node.to + ": " + s.substring(c.from, c.to) + c.node.type.name);
  }
}

const isStmt = (st: any): st is Stmt<null> => !(st.hasOwnProperty("typedvar") || st.hasOwnProperty("params"));
const isVarDef = (st: any): st is VarDef<null> => st.hasOwnProperty("typedvar");
const isFuncDef = (st: any): st is FuncDef<null> => st.hasOwnProperty("params");
const isMethodDef = (st: any): st is MethodDef<null> => st.hasOwnProperty("params");
const isProgram = (st: any): st is Program<null> => st.hasOwnProperty("funcdefs");

export function traverse(c : TreeCursor, s : string) : Program<null> {
  
  switch(c.node.type.name) {
    case "Script":
      const program: Program<null> = {vardefs: [], funcdefs: [], stmts: [], classdefs: []}
      c.firstChild();
      do {
        const st = traverseStmt(c, s, program);
        if (isStmt(st)){
          program.stmts.push(st);
        }
      } while(c.nextSibling())
      // console.log("traversed " + program.stmts.length + " statements ", program.stmts, "stopped at " , c.node);so
      console.log(program)
      return program;
    default:
      throw new Error("Could not parse program at " + c.node.from + " " + c.node.to);
  }
}
export function parse(source : string) : Program<null> {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}
