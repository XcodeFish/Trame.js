import { terser } from 'rollup-plugin-terser';

export default [
  // ESM 构建
  {
    input: 'src/index.js',
    output: {
      file: 'dist/trame.esm.js',
      format: 'es',
      sourcemap: true,
      exports: 'named',
    },
    plugins: [terser()],
  },
  // CJS 构建
  {
    input: 'src/index.js',
    output: {
      file: 'dist/trame.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    plugins: [terser()],
  },
  // UMD 构建 (可直接在浏览器中使用)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/trame.umd.js',
      format: 'umd',
      name: 'trame',
      sourcemap: true,
      exports: 'named',
    },
    plugins: [terser()],
  }
];
