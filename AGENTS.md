# Project Context for AI Agents

## GitHub
- Remote: `https://github.com/lvs-vladimir/strakudos.git`
- Push: read token from `.secrets/github.properties` (`github.token`), then:
  1. Set remote: `git remote set-url origin https://lvs-vladimir:TOKEN@github.com/lvs-vladimir/strakudos.git`
  2. Push: `git push`
  3. Reset remote: `git remote set-url origin https://github.com/lvs-vladimir/strakudos.git`
