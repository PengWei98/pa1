1.
I define a type `Literal` in my code to represent integers, booleans and None.

```
export type Literal<A> = 
    { a ?: A, tag: "num", value: number }
  | { a ?: A, tag: "bool", value: boolean }
  | { a ?: A, tag: "none" }
```

 In WASM, integers are their real value, booleans are 0 or 1 and None is 0.

To print True, False, I modified the function `print` and design three new function `print_num`, `print_bool` and `print_none`. In typeChecker, when checking the function `print` in python code, I transfered it to `print_num`, `print_bool` and `print_none` according to the type of the parameter.

```webstart.ts
print_num: (arg : any) => {
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg;
          return arg;
        },
        print_bool: (arg : any) => {
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg === 1 ? "True" : "False";
          return arg === 1 ? "True" : "False";
        },
        print_none: (arg : any) => {
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = "None";
          return "None";
        },
```



```typecheck.ts
case "builtin1":
            const arg1 = expr.arg;
            const typedArg1 = typeCheckExpr(arg1, env);
            if (expr.name === "print"){
                if (typedArg1.a === Type.int) {
                    return { ...expr, name: "print_num", a: Type.none, arg: typedArg1};
                } else if (typedArg1.a === Type.bool) {
                    return { ...expr, name: "print_bool", a: Type.none, arg: typedArg1};
                } else {
                    return { ...expr, name: "print_none", a: Type.none, arg: typedArg1};
                }
            }else if (expr.name === "abs"){
                return { ...expr, a: Type.int, arg: typedArg1};
            }else{
                throw new Error("REFERENCE ERROR");
            }
```



2.

- At least one global variable

  I'm sorry that the global variable is not currently supported.

- At least one function with a parameter

![image-20220413230206486](/Users/pengwei/Library/Application Support/typora-user-images/image-20220413230206486.png)

The parameters are stored in the `FuncDef.params`. And `FuncDef` is defined here(https://github.com/PengWei98/pa1/blob/main/ast.ts#L40)

![image-20220413234939743](/Users/pengwei/Library/Application Support/typora-user-images/image-20220413234939743.png)

- At least one variable defined inside a function

  I'm sorry that the variable defined inside a function is not currently supported.

3.

![image-20220413230352748](/Users/pengwei/Library/Application Support/typora-user-images/image-20220413230352748.png)

The integer was printed in the consoler continuously and finally the web browser broken down.



4.

- 1.

![image-20220413230840123](/Users/pengwei/Library/Application Support/typora-user-images/image-20220413230840123.png)

- 2.

![image-20220413231206544](/Users/pengwei/Library/Application Support/typora-user-images/image-20220413231206544.png)

- 3.

  ![image-20220413231332909](/Users/pengwei/Library/Application Support/typora-user-images/image-20220413231332909.png)

- 4. This function is not supported.
- 5.

![image-20220413231625454](/Users/pengwei/Library/Application Support/typora-user-images/image-20220413231625454.png)

- 6.Recursive function is not supported.
- 7.Recursive function is not supported.

5. I choose the example in 2.2(Give an example of a program that uses at least one function with a parameter)

I define the type of the function like this, the `FuncDef.params ` is its params, represented by a list. So it can have zero or more parameters.

![image-20220413232246882](/Users/pengwei/Library/Application Support/typora-user-images/image-20220413232246882.png)

In the typechecker, I check the type of the function:

![image-20220413232341471](/Users/pengwei/Library/Application Support/typora-user-images/image-20220413232341471.png)

When the function is called, I will choose the type for each arguments. And I also checked the whether the function has already defined.

![image-20220413234406028](/Users/pengwei/Library/Application Support/typora-user-images/image-20220413234406028.png)



Explanation: Some of the functions are too hard for me. Acctually, for some features like resursive function or global variable,  the code can be compliled into WASM but there are some runtime error when running WASM. And the resource on the internet about WASM are so rare so it's really hard for me to find the solutions. I will try my best to solve it.