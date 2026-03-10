export default {
  plugins: {
    tailwindcss: {},
    cssnano: { preset: ['advanced', { discardComments: { removeAll: true } }] },
  },
}
