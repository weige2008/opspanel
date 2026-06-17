export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"Segoe UI"', 'Inter', 'system-ui', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      maxWidth: { '8xl': '88rem' }
    }
  },
  plugins: []
};
