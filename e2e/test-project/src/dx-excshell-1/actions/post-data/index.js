async function main(params) {
  const response = {
    statusCode: 200,
    body: {
      params
    }
  }
  return response
}
exports.main = main