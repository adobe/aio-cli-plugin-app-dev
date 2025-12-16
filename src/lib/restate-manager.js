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
const fetch = require('node-fetch')

/**
 * Manages the Restate server lifecycle for agent development
 */
class RestateManager {
  constructor(logger) {
    this.logger = logger
    this.process = null
    this.ingressPort = 8080
    this.adminPort = 9070
    this.containerName = 'aio-restate-dev'
  }
  
  /**
   * Check if Docker is installed and available
   */
  async checkDocker() {
    return new Promise((resolve) => {
      const proc = spawn('docker', ['--version'], { stdio: 'ignore' })
      proc.on('close', (code) => {
        resolve(code === 0)
      })
      proc.on('error', () => {
        resolve(false)
      })
    })
  }
  
  /**
   * Check if Restate server is already running
   */
  async isRunning() {
    try {
      const response = await fetch(`http://localhost:${this.adminPort}/health`, {
        timeout: 2000
      })
      return response.ok
    } catch {
      return false
    }
  }
  
  /**
   * Check if Restate container exists
   */
  async containerExists() {
    return new Promise((resolve) => {
      const proc = spawn('docker', ['ps', '-a', '--filter', `name=${this.containerName}`, '--format', '{{.Names}}'], {
        stdio: ['ignore', 'pipe', 'ignore']
      })
      
      let output = ''
      proc.stdout.on('data', (data) => {
        output += data.toString()
      })
      
      proc.on('close', () => {
        resolve(output.trim() === this.containerName)
      })
    })
  }
  
  /**
   * Start the Restate server
   */
  async start() {
    this.logger.debug('Checking Restate server...')
    
    // Check if Docker is available
    const hasDocker = await this.checkDocker()
    if (!hasDocker) {
      throw new Error(
        'Docker is required to run Restate for agent mode.\n' +
        'Please install Docker: https://docs.docker.com/get-docker/'
      )
    }
    
    // Check if already running
    if (await this.isRunning()) {
      this.logger.debug('✓ Restate server already running')
      return
    }
    
    // Check if container exists but is stopped
    if (await this.containerExists()) {
      this.logger.debug('Starting existing Restate container...')
      await this.startExistingContainer()
    } else {
      this.logger.debug('Starting new Restate container...')
      await this.startNewContainer()
    }
    
    // Wait for Restate to be ready
    await this.waitForReady()
  }
  
  /**
   * Start existing container
   */
  async startExistingContainer() {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['start', this.containerName], {
        stdio: 'ignore'
      })
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error('Failed to start existing Restate container'))
        }
      })
    })
  }
  
  /**
   * Start new container
   */
  async startNewContainer() {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', [
        'run',
        '-d',
        '--name', this.containerName,
        '--rm',
        '-p', `${this.ingressPort}:8080`,
        '-p', `${this.adminPort}:9070`,
        'docker.io/restatedev/restate:latest'
      ], {
        stdio: 'ignore'
      })
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error('Failed to start Restate container'))
        }
      })
      
      proc.on('error', (err) => {
        reject(new Error(`Failed to start Restate: ${err.message}`))
      })
    })
  }
  
  /**
   * Wait for Restate to be ready
   */
  async waitForReady(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.isRunning()) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    throw new Error('Restate server failed to start within 30 seconds')
  }
  
  /**
   * Register a single agent with Restate
   */
  async registerAgent(name, port) {
    const uri = `http://host.docker.internal:${port}`
    
    this.logger.debug(`  Registering ${name}...`)
    
    try {
      const response = await fetch(`http://localhost:${this.adminPort}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
        timeout: 10000
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Registration failed: ${error}`)
      }
      
      this.logger.debug(`  ✓ Registered ${name}`)
    } catch (err) {
      this.logger.error(`  ✗ Failed to register ${name}: ${err.message}`)
      throw err
    }
  }
  
  /**
   * Register all agents with Restate
   */
  async registerAllAgents(agentInfos) {
    for (const { name, port } of agentInfos) {
      await this.registerAgent(name, port)
    }
  }
  
  /**
   * Stop the Restate server
   */
  async stop() {
    try {
      this.logger.info('Stopping Restate server...')
      
      return new Promise((resolve) => {
        const proc = spawn('docker', ['stop', this.containerName], {
          stdio: 'ignore'
        })
        
        proc.on('close', (code) => {
          if (code === 0) {
            this.logger.info('✓ Restate server stopped')
          }
          resolve()
        })
        
        proc.on('error', () => {
          // Container might already be stopped, that's okay
          resolve()
        })
        
        // Don't wait forever
        setTimeout(() => resolve(), 5000)
      })
    } catch (err) {
      // Ignore errors, container might already be stopped
      this.logger.debug('Error stopping Restate:', err.message)
    }
  }
}

module.exports = { RestateManager }

