pipeline {
    agent {
        kubernetes {
            yaml '''
              apiVersion: v1
              kind: Pod
              metadata:
                name: sched
                namespace: jenkins
              spec:
                affinity:
                  podAntiAffinity:
                    preferredDuringSchedulingIgnoredDuringExecution:
                    - weight: 50
                      podAffinityTerm:
                        labelSelector:
                          matchExpressions:
                          - key: jenkins/jenkins-jenkins-agent
                            operator: In
                            values:
                            - "true"
                        topologyKey: kubernetes.io/hostname
                securityContext:
                  runAsUser: 0
                  runAsGroup: 0
                  fsGroup: 0
                priorityClassName: "jenkins-low-priority"
                containers:
                - name: sched-builder
                  image: eddevopsd2/maven-java-npm-docker:mvn3.9.6-jdk21-node22-docker-nvm
                  imagePullPolicy: Always
                  volumeMounts:
                  - name: sonar-scanner
                    mountPath: /root/sonar-scanner
                  tty: true
                  securityContext:
                    privileged: true
                    runAsUser: 0
                imagePullSecrets:
                - name: regcred
                volumes:
                - name: sonar-scanner
                  persistentVolumeClaim:
                    claimName: sonar-scanner-nfs-pvc
            '''
            workspaceVolume persistentVolumeClaimWorkspaceVolume(claimName: 'workspace-nfs-pvc', readOnly: false)
        }
    }
    options {
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 3, unit: 'HOURS')
    }
    stages {
        stage ('Prerequisites') {
            steps {
                container (name: 'sched-builder') {
                    sh '''
                    cd scheduler
                    npm install --global yarn
                    yarn install
                    '''
                }
            }
        }
        stage('Build') {
            steps {
                container (name: 'sched-builder') {
                    sh '''
                    cd scheduler
                    yarn test
                    '''
                }
            }
        }
        stage('Sonar Analysis') {
            steps {
                container (name: 'sched-builder') {
                    withSonarQubeEnv('sonar'){
                        sh '/root/sonar-scanner/sonar-scanner/bin/sonar-scanner -Dsonar.host.url=${SONAR_HOST_URL} -Dsonar.token=${SONAR_GLOBAL_KEY} -Dsonar.working.directory="/tmp"'
                    }
                }
            }
        }
        stage('Produce bom.json for frontend') {
            steps{
                container (name: 'sched-builder') {
                    sh '''
                        cd scheduler
                        npm install --global @cyclonedx/cdxgen
                        cdxgen -t nodejs -o bom.json
                    '''
                }
            }
        }
        stage('Dependency-Track Analysis') {
            steps{
                container (name: 'sched-builder') {
                    sh '''
                        echo '{"project": "03b3af51-fef1-4143-9973-5c846ccf16e4", "bom": "'"$(cat scheduler/bom.json | base64 -w 0)"'"}' > payload.json
                    '''
                    sh '''
                        curl -X "PUT" ${DEPENDENCY_TRACK_URL} -H 'Content-Type: application/json' -H 'X-API-Key: '${DEPENDENCY_TRACK_API_KEY} -d @payload.json
                    '''
                }
            }
        }
    }
}