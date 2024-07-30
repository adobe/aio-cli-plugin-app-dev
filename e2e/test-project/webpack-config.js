
module.exports = {
  module: {
    rules: [
      {
        test: /syntaxidermist\/index.js$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '__index.js',
              emitFile: true
            }
          },
        ],
      },
    ],
  },
}
