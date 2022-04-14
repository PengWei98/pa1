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

