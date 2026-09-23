# Jenkins setup — no Docker Compose

## Jenkins credentials

Create:

1. `ec2-ssh-key`
   - Kind: SSH Username with private key
   - Private key for the EC2 user

2. `ec2-user`
   - Secret text
   - Example: ubuntu

3. `ec2-host`
   - Secret text
   - EC2 public DNS name or public IP

4. `todo-backend-url`
  - Secret text
  - The HTTP URL that the ECS frontend task can use to reach the backend, including the port if needed (for example, `http://todo-backend.internal:3000`)

## Existing ECR images

The ECS pipeline does not build or push Docker images. It verifies and deploys the existing `latest` images from `todo-backend` and `todo-frontend`. Change `ECR_IMAGE_TAG` in `jenkins/jenkinsfile-ecs` if your images use another tag.

## Jenkins agent

Install:
- Git
- Docker
- SSH client

The Jenkins agent runs Docker builds.

## EC2

Install Docker:

sudo ./deploy/install-docker-ubuntu.sh

Create the application directory:

mkdir -p ~/todo-devops-lab

Create:

~/todo-devops-lab/.env

using deploy/.env.example as the template.

IMPORTANT: Do not commit .env.

## EC2 IAM role

Attach an IAM role to EC2 with permission to send SMS through SNS.

Example training policy:

{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sns:Publish"
      ],
      "Resource": "*"
    }
  ]
}

The application container receives AWS credentials through the EC2 instance metadata/IAM role; no AWS access keys are placed inside the container.

## ECS backend connectivity

The ECS frontend uses Nginx to proxy `/api/*` to the URL in the `todo-backend-url` Jenkins credential. That URL must resolve and be reachable from the frontend task, typically through ECS service discovery or direct private networking. Do not use `http://todo-backend:3000` for ECS; that Docker-network name is only valid in the local `deploy/deploy.sh` deployment.

## Security group

Allow:
- TCP 22 from Jenkins IP/security group
- TCP 80 from users

Do NOT expose:
- TCP 3000
- TCP 5432

## Jenkins flow

Git -> Jenkins -> build images -> copy source -> SSH EC2 -> build/start containers -> health check

This intentionally uses docker build/docker run, not Docker Compose.