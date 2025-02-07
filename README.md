# Capella Document Search

A modern document search application built with Bun, Svelte, and ELysiaJS that enables searching across Capella scopes and collections. Features OpenReplay integration for monitoring and OpenTelemetry for observability.

## 🚀 Features

- **Document Search**: Search across Capella scopes and collections
- **Real-time Chat**: AI-powered chat interface using OpenAI and Pinecone
- **High Performance**: Built with Bun runtime and SvelteKit
- **Observability**: Comprehensive OpenTelemetry integration
- **Session Replay**: OpenReplay integration for debugging and monitoring
- **Docker Support**: Multi-architecture container support (arm64/amd64)

## 📋 Prerequisites

- [Bun](https://bun.sh) (latest version)
- [Docker](https://www.docker.com/) (for containerized deployment)
- Capella account and credentials
- OpenAI API key
- Pinecone API key

## 🛠️ Installation

### Local Development

```bash
# Create a new project
bun create svelte@latest my-app

# Install dependencies
bun install

# Start development server
bun run dev

# Open browser
bun run dev -- --open
```

### Docker Deployment

```bash
# Build the Docker image
docker build -t capella-document-search .

# Run the container
docker run -p 3000:3000 --env-file .env capella-document-search
```

## ⚙️ Configuration

The application uses environment variables for configuration. Create a `.env` file:

```env
# Capella Configuration
API_BASE_URL=your-capella-api-url
ORG_ID=your-org-id
PROJECT_ID=your-project-id
CLUSTER_ID=your-cluster-id
BUCKET_ID=your-bucket-id
AUTH_TOKEN=your-auth-token

# OpenAI Configuration
OPENAI_API_KEY=your-openai-key

# Pinecone Configuration
PINECONE_API_KEY=your-pinecone-key
PINECONE_INDEX_NAME=your-index-name
PINECONE_NAMESPACE=your-namespace

# OpenTelemetry Configuration
ENABLE_OPENTELEMETRY=true
SERVICE_NAME=capella-document-search
```

## 🔍 Features

### Document Search
Search functionality across Capella scopes and collections with real-time results.

### AI-Powered Chat
Integrated chat interface using OpenAI and Pinecone for intelligent document querying.

### Session Replay
Built-in OpenReplay integration for debugging and monitoring user sessions.

## 🔒 Security

The application includes several security features:

- Authentication middleware
- Security headers
- Protected routes
- DNS prefetching for authenticated endpoints

## 📊 Monitoring & Observability

Comprehensive monitoring setup including:

- OpenReplay session tracking
- OpenTelemetry integration
- Performance monitoring
- Error tracking

## 🚀 CI/CD

Automated GitHub Actions workflow for:

- Multi-architecture Docker builds
- Automated testing
- Security scanning
- Image verification
- Build artifacts management

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Author

- Simon Owusu - [zx8086](https://github.com/zx8086)

## 📧 Support

For support, email simonowusupvh@gmail.com or open an issue in the repository.
