module.exports = {
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /tsAction\/index.ts$/,
        // includes, excludes are in tsconfig.json
        use: 'ts-loader'
      },
      {
        test: /syntaxidermist\/index.js$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '__index.js',
              emitFile: true
            }
          }
        ]
      }
    ]
  }
}
