#!/usr/bin/env node
/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/**
 * Universal Restate Service Server Shim
 * 
 * This script loads user's compiled agent code and serves it with the CLI's Restate SDK.
 * This matches production invoker behavior where user code is loaded and served
 * with the runtime's SDK instance.
 * 
 * Service files should export { object, name } or { workflow, name } or { service, name }
 * The handlers are then recreated using the CLI's SDK.
 * 
 * Usage: node agent-server.js <path-to-service-bundle>
 */

const path = require('path')


const restate = require('@restatedev/restate-sdk')

// Get service path from command line args
const servicePath = process.argv[2]
if (!servicePath) {
  console.error('Error: Service path is required')
  console.error('Usage: node agent-server.js <path-to-service-bundle>')
  process.exit(1)
}

const resolvedServicePath = path.resolve(servicePath)

// Import the service module
let loadedAgent
try {
  // Clear require cache to support hot reload
  delete require.cache[require.resolve(resolvedServicePath)]
  loadedAgent = require(resolvedServicePath)
  
  // Support export default syntax
  if (loadedAgent.default && typeof loadedAgent.default === 'object') {
    loadedAgent = loadedAgent.default
  }
} catch (error) {
  console.error(`Failed to load service from ${resolvedServicePath}:`, error.message)
  console.error(error.stack)
  process.exit(1)
}

// Recreate the agent using the runtime's SDK instance
// This is necessary because the loaded agent was created with a different SDK instance
let service
let handlers

if (loadedAgent.hasOwnProperty('object')) {
  handlers = loadedAgent.object
  service = restate.object({
    name: loadedAgent.name,
    handlers: handlers
  })
} else if (loadedAgent.hasOwnProperty('workflow')) {
  handlers = loadedAgent.workflow
  service = restate.workflow({
    name: loadedAgent.name,
    handlers: handlers
  })
} else if (loadedAgent.hasOwnProperty('service')) {
  handlers = loadedAgent.service
  service = restate.service({
    name: loadedAgent.name,
    handlers: handlers
  })
} else {
  throw new Error(`Invalid agent type: ${loadedAgent}`)
}

// Get port from environment (set by AgentRunner)
const PORT = parseInt(process.env.PORT || '9200')

// Serve the service
try {
  restate.serve({
    services: [service],
    port: PORT
  })
} catch (error) {
  console.error(`Failed to serve service on port ${PORT}:`, error.message)
  console.error(error.stack)
  process.exit(1)
}
