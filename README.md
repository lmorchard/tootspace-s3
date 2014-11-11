tootspace-s3
------------

[![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy)

A microservice for brokering write access to a shared Amazon S3 bucket using
Login with Amazon access tokens.

What's this thing for?
======================

I want to find a way for apps (like [Tootr][]) to [publish to the
web][apppublishing] using a simple UX and API.

[Amazon S3][] offers a nice publishing API usable from web apps. But,
authentication with that AWS is tough in terms of general user experience.
Remembering and entering long random alphanumeric strings is troublesome,
especially on mobile devices.

[Login with Amazon][] offers a decent user experience for authentication. And, it
can be used to [generate temporary credentials that work with Amazon
S3][mobilestorage] when the appropriate roles and permissions are configured in
Amazon IAM. 

But, there are some limits with this combination. For example:

* Users are stuck with names like `amzn1.account.AF5OSES2YS8675309`, which are
  neither memorable nor pretty.

* There are no limits on the content types or lengths of resources uploaded to
  S3 - i.e. nothing stopping anyone from logging in and uploading a 25GB video
  collection to shared storage on someone else's tab.

So, this small server exists as glue between Amazon S3 and Login with Amazon,
offering two things:

1. A registration API that allows a user to claim a more friendly nickname
   associated with their Amazon-generated user ID.

2. Generation of [pre-signed Amazon S3 POST URLs](presigned) that allow write
   access to a registered user's reserved space within an Amazon S3 bucket,
   with restrictions on content type and length.

Most of the heavy lifting for web publishing still happens on Amazon S3. This
microservice just introduces a small bit of intelligence in managing the shared
space.

Hacking Notes
=============

### Generating a self-signed SSL cert

```bash
openssl genrsa -out key.pem
openssl req -new -key key.pem -out csr.pem
openssl x509 -req -days 9999 -in csr.pem -signkey key.pem -out cert.pem
```

[Amazon S3]: http://aws.amazon.com/s3/
[Login with Amazon]: http://login.amazon.com/
[Tootr]: https://github.com/lmorchard/tootr
[apppublishing]: http://blog.lmorchard.com/2014/10/09/separating-publishing-from-hosting-on-the-web/
[mobilestorage]: https://aws.amazon.com/articles/4617974389850313
[presigned]: http://docs.aws.amazon.com/AmazonS3/latest/dev/PresignedUrlUploadObject.html
