// Convenção NO_COLOR (https://no-color.org): desliga as cores antes de carregar o Ink/chalk.
if (process.env.NO_COLOR) process.env.FORCE_COLOR = "0";

await import("./index");

export {};
