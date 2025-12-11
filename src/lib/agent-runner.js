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

const { spawn } = require('child_process')
const path = require('path')

/**
 * Manages the lifecycle of agent processes
 */
class AgentRunner {
  constructor(config) {
    this.config = config
    this.processes = new Map()
    this.basePort = 9200
  }
  
  /**
   * Start all agent processes
   * @param {Array} agents - Array of agent configurations
   * @param {object} options - Options for starting agents
   * @param {boolean} options.debug - Whether to start with debugger enabled
   */
  async startAgents(agents, options = {}) {
    const debugMode = options.debug || false
    console.log(`Starting ${agents.length} agent${agents.length > 1 ? 's' : ''}${debugMode ? ' with debugger' : ''}...`)
    
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]
      const port = this.basePort + i
      const debugPort = debugMode ? 9229 + i : null
      
      await this.startAgent(agent, port, debugPort)
    }
    
    console.log('✓ All agents started!')
  }
  
  /**
   * Start a single agent process
   * @param {object} agent - Agent configuration
   * @param {number} port - Port for the agent to listen on
   * @param {number|null} debugPort - Debug port (if debugging enabled)
   */
  async startAgent(agent, port, debugPort = null) {
    // buildActions uses webpack to bundle to: dist/application/actions/{package}/{action}-temp/index.js
    const compiledPath = this.getCompiledPath(agent.package, agent.name)
    const functionPath = path.resolve(this.config.root, compiledPath)
    const componentName = `${agent.package}-${agent.name}`
    
    const env = {
      ...process.env,
      PORT: port.toString(),
      RESTATE_COMPONENT_NAME: componentName
    }
    
    // Build node arguments
    const nodeArgs = []
    if (debugPort) {
      nodeArgs.push(`--inspect=${debugPort}`)
    }
    nodeArgs.push(functionPath)
    
    const proc = spawn('node', nodeArgs, {
      env,
      cwd: this.config.root,
      stdio: ['ignore', 'pipe', 'pipe'] // Pipe stdout and stderr so we can prefix them
    })
    
    // Prefix stdout with agent name
    proc.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n')
      lines.forEach(line => {
        if (line) {
          console.log(`[${agent.name}] ${line}`)
        }
      })
    })
    
    // Prefix stderr with agent name
    proc.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n')
      lines.forEach(line => {
        if (line) {
          console.error(`[${agent.name}] ${line}`)
        }
      })
    })
    
    proc.on('error', (err) => {
      console.error(`[${agent.name}] Error:`, err)
    })
    
    proc.on('exit', (code, signal) => {
      if (signal) {
        console.log(`[${agent.name}] Stopped by signal ${signal}`)
      } else if (code !== 0) {
        console.error(`[${agent.name}] Exited with code ${code}`)
      }
      this.processes.delete(agent.name)
    })
    
    this.processes.set(agent.name, { 
      process: proc, 
      port,
      debugPort,
      agent,
      componentName
    })
    
    // Wait a bit for agent to start
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  /**
   * Stop all agent processes
   */
  async stopAll() {
    if (!this.processes || this.processes.size === 0) {
      return
    }
    
    console.log('Stopping all agents...')
    for (const [name, agentInfo] of this.processes) {
      if (agentInfo && agentInfo.process) {
        try {
          agentInfo.process.kill('SIGTERM')
        } catch (err) {
          console.error(`Error stopping ${name}:`, err.message)
        }
      }
    }
    this.processes.clear()
  }
  
  /**
   * Restart specific agents (stop and start them)
   * @param {Array} agents - Array of agent objects to restart
   */
  async restartAgents(agents) {
    console.log(`Restarting ${agents.length} agent(s)...`)
    
    for (const agent of agents) {
      // Get current process info
      const processInfo = this.processes.get(agent.name)
      if (!processInfo) {
        console.warn(`Agent ${agent.name} not found in running processes`)
        continue
      }
      
      const { port, debugPort } = processInfo
      
      // Stop the agent
      console.log(`  Stopping ${agent.name}...`)
      if (processInfo.process && !processInfo.process.killed) {
        processInfo.process.kill('SIGTERM')
      }
      this.processes.delete(agent.name)
      
      // Wait a bit for process to fully stop
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Start it again with same port and debug port
      console.log(`  Starting ${agent.name}...`)
      await this.startAgent(agent, port, debugPort)
    }
    
    console.log('✓ Agents restarted!')
  }
  
  /**
   * Get information about running agents
   */
  getAgentInfo() {
    const info = []
    for (const [name, { port, debugPort, agent, componentName }] of this.processes) {
      info.push({ 
        name, 
        port,
        debugPort,
        componentName,
        status: 'running' 
      })
    }
    return info
  }
  
  /**
   * Generate curl commands for registering agents
   */
  getRegistrationCommands() {
    const commands = []
    for (const [name, { port, componentName }] of this.processes) {
      commands.push({
        name,
        componentName,
        port,
        command: `curl -X POST http://localhost:9070/deployments -H "Content-Type: application/json" -d '{"uri": "http://host.docker.internal:${port}"}'`
      })
    }
    return commands
  }
  
  /**
   * Get the compiled (webpack bundled) path for an agent.
   * Uses the same logic as defaultActionLoader for regular actions:
   *   {distFolder}/{packageName}/{actionName}-temp/index.js
   * 
   * @param {string} packageName - Package name from config
   * @param {string} actionName - Action name from config
   * @returns {string} - Compiled webpack bundle path
   */
  getCompiledPath(packageName, actionName) {
    const distFolder = this.config.actions.dist || 'dist'

    const actionFolder = path.join(distFolder, packageName, actionName)
    return `${actionFolder}-temp/index.js`
  }
}

module.exports = { AgentRunner }

