/**
 * 打包精简 echarts（小程序环境，需抹掉 process）
 * 用法：node components/ec-canvas/build-echarts.js
 */
const esbuild = require('esbuild');
const path = require('path');

esbuild
  .build({
    entryPoints: [path.join(__dirname, '_echarts-entry.js')],
    bundle: true,
    format: 'esm',
    minify: true,
    outfile: path.join(__dirname, 'echarts.js'),
    platform: 'browser',
    mainFields: ['module', 'main'],
    define: {
      'process.env.NODE_ENV': '"production"',
      global: 'undefined',
    },
    banner: {
      // 兜底：防止残留 process 引用
      js: 'var process={env:{NODE_ENV:"production"}};',
    },
  })
  .then(() => {
    console.log('echarts.js built ok');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
