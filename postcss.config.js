export default {
  plugins: {
    tailwindcss: {},
    cssnano: { preset: ['default', { discardComments: { removeAll: true } }] },
  },
}
